from __future__ import annotations

import os
import shutil
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = ROOT_DIR / "backend"
FRONTEND_DIR = ROOT_DIR / "frontend"
BACKEND_PORT = 8000
FRONTEND_PORT = 5173
BACKEND_URL = f"http://127.0.0.1:{BACKEND_PORT}/health"
FRONTEND_URL = f"http://127.0.0.1:{FRONTEND_PORT}"
WINDOWS = os.name == "nt"
VITE_BIN = FRONTEND_DIR / "node_modules" / "vite" / "bin" / "vite.js"


def fail(message: str) -> int:
    print(f"[error] {message}", file=sys.stderr)
    return 1


def resolve_backend_python() -> Path:
    if WINDOWS:
        candidate = BACKEND_DIR / "venv" / "Scripts" / "python.exe"
    else:
        candidate = BACKEND_DIR / "venv" / "bin" / "python"

    if candidate.exists():
        return candidate
    return Path(sys.executable)


def resolve_node() -> str | None:
    command = "node.exe" if WINDOWS else "node"
    return shutil.which(command)


def ensure_requirements() -> int:
    backend_python = resolve_backend_python()
    if not backend_python.exists():
        return fail(f"Backend Python not found at {backend_python}")

    if not (FRONTEND_DIR / "node_modules").exists():
        return fail(f"Frontend dependencies missing at {FRONTEND_DIR / 'node_modules'}")

    if not VITE_BIN.exists():
        return fail(f"Vite entrypoint not found at {VITE_BIN}")

    if resolve_node() is None:
        return fail("node was not found in PATH")

    return 0


def port_in_use(port: int) -> bool:
    import socket

    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.3)
        return sock.connect_ex(("127.0.0.1", port)) == 0


def wait_for_url(url: str, name: str, process: subprocess.Popen[str], timeout: int = 30) -> int:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if process.poll() is not None:
            return fail(f"{name} exited with code {process.returncode}")
        try:
            with urllib.request.urlopen(url, timeout=1):
                print(f"[{name}] ready at {url}")
                return 0
        except (urllib.error.URLError, TimeoutError):
            time.sleep(1)
    return fail(f"{name} did not respond at {url}")


def terminate_process(process: subprocess.Popen[str], name: str) -> None:
    if process.poll() is not None:
        return

    print(f"[{name}] stopping...")
    if WINDOWS:
        subprocess.run(
            ["taskkill", "/PID", str(process.pid), "/T", "/F"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
    else:
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            return

    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()


def start_backend() -> subprocess.Popen[str]:
    backend_python = resolve_backend_python()
    command = [str(backend_python), "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", str(BACKEND_PORT)]
    print(f"[backend] starting: {' '.join(command)}")
    return subprocess.Popen(command, cwd=BACKEND_DIR)


def start_frontend() -> subprocess.Popen[str]:
    node = resolve_node()
    assert node is not None
    command = [node, str(VITE_BIN), "--host", "127.0.0.1", "--port", str(FRONTEND_PORT)]
    print(f"[frontend] starting: {' '.join(command)}")
    return subprocess.Popen(command, cwd=FRONTEND_DIR)


def main() -> int:
    if ensure_requirements():
        return 1

    if port_in_use(BACKEND_PORT):
        return fail(f"Port {BACKEND_PORT} is already in use")
    if port_in_use(FRONTEND_PORT):
        return fail(f"Port {FRONTEND_PORT} is already in use")

    backend_process: subprocess.Popen[str] | None = None
    frontend_process: subprocess.Popen[str] | None = None

    try:
        backend_process = start_backend()
        if wait_for_url(BACKEND_URL, "backend", backend_process):
            return 1

        frontend_process = start_frontend()
        if wait_for_url(FRONTEND_URL, "frontend", frontend_process):
            return 1

        print()
        print(f"Backend:  http://127.0.0.1:{BACKEND_PORT}")
        print(f"Frontend: http://127.0.0.1:{FRONTEND_PORT}")
        print("Press Ctrl+C to stop both servers.")

        while True:
            if backend_process.poll() is not None:
                return fail(f"backend exited with code {backend_process.returncode}")
            if frontend_process.poll() is not None:
                return fail(f"frontend exited with code {frontend_process.returncode}")
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n[runner] stopping servers...")
        return 0
    finally:
        if frontend_process is not None:
            terminate_process(frontend_process, "frontend")
        if backend_process is not None:
            terminate_process(backend_process, "backend")


if __name__ == "__main__":
    raise SystemExit(main())

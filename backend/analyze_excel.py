import pandas as pd
import sys

def analyze_excel(file_path):
    print(f"=== Analyzing {file_path} ===")
    try:
        xl = pd.ExcelFile(file_path)
        print(f"Sheets: {xl.sheet_names}")
        for sheet in xl.sheet_names:
            print(f"-- Sheet: {sheet} --")
            df = pd.read_excel(file_path, sheet_name=sheet, nrows=5)
            print("Columns:")
            print(df.columns.tolist())
            print("First 2 rows:")
            print(df.head(2).to_string())
    except Exception as e:
        print(f"Error reading {file_path}: {e}")
    print("\n")

if __name__ == "__main__":
    files = [
        r"c:\Users\promb\Desktop\sevices\backend\teamp\Templat-Report.xlsx",
        r"c:\Users\promb\Desktop\sevices\uploads\projects\Oakwood Suites Bangkok\Oakwood RMS Maintenance\documents\templates\Templat-Report.xlsx",
        r"c:\Users\promb\Desktop\sevices\uploads\projects\Oakwood Suites Bangkok\Oakwood RMS Maintenance\reports\12-03-2026_0827_oakwood-rms-maintenance_oakwood-rms-maintenance_ma_0001.xlsx"
    ]
    for f in files:
        analyze_excel(f)

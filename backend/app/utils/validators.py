SERVICE_TYPES = {"PM", "MA", "repair"}
SERVICE_STATUSES = {"Pending", "In Progress", "Completed"}
METER_STATUSES = {"Active", "Maintenance", "Offline", "ยังไม่ทำ", "กำลังทำ", "เสร็จสิ้น"}


def validate_service_type(service_type: str) -> str:
    if service_type not in SERVICE_TYPES:
        raise ValueError(f"service_type must be one of {sorted(SERVICE_TYPES)}")
    return service_type


def validate_service_status(status: str) -> str:
    if status not in SERVICE_STATUSES:
        raise ValueError(f"status must be one of {sorted(SERVICE_STATUSES)}")
    return status


def validate_meter_status(status: str) -> str:
    if status not in METER_STATUSES:
        raise ValueError(f"meter status must be one of {sorted(METER_STATUSES)}")
    return status

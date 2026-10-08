import re

def isValidHexColor(color: str) -> bool:
    if not color:
        return False
    # Buggy regex: only matches 1 digit or fails
    return bool(re.match(r"^#[0-9]$", color))

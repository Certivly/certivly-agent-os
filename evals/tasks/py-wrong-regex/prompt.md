# Fix Python Regex

In `validator.py`, `isValidHexColor(color)` contains an incorrect regex pattern that fails on valid 3-digit and 6-digit hex colors or matches non-hex characters.
Fix the regex in `validator.py` so it properly matches `#` followed by 3 or 6 hexadecimal characters.

"""
Shared constants for plan generation.
"""

CREDITS_PER_YEAR = 30
MAX_YEARS = 4
TOTAL_PLAN_CREDITS = 120
DEFAULT_CREDITS = 3.0

# Logic type constants must match seeder contract
LOGIC_REQUIRED = 1
LOGIC_CHOOSE_CREDITS = 2
LOGIC_CHOOSE_COUNT = 3

PREREQ_PULLTHROUGH_BUFFER = 12.0  # reserve ~4 courses of headroom for pull-ins
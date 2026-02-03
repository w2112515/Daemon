"""
Pytest configuration for agent tests
"""

import sys
from pathlib import Path

# Add agent directory to Python path for wallet module access
agent_dir = Path(__file__).parent.parent
sys.path.insert(0, str(agent_dir))

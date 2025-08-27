"""
Simple test script to check QnA agent initialization
"""

import sys
import os
from pathlib import Path

# Add the parent directory to the Python path
sys.path.append(str(Path(__file__).parent))

def test_qna_agent():
    print("🔍 Testing QnA agent initialization...")
    
    try:
        from qna_agent_service.agent import QnAAgent
        print("✅ Successfully imported QnAAgent")
        
        # Try to initialize the agent
        agent = QnAAgent()
        print("✅ Successfully initialized QnAAgent")
        
        return True
        
    except Exception as e:
        print(f"❌ Error with QnA agent: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_qna_agent()
    if success:
        print("🎉 QnA agent test passed!")
    else:
        print("💥 QnA agent test failed!") 
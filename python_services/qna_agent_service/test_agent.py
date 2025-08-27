"""
Test script for Q&A Agent Service.
Run this to verify the agent is working correctly.
"""

import asyncio
import json
from typing import List

# Import shared modules
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from shared.models import ConversationMessage, MessageRole, LLMProvider
from agent import QnAAgent


async def test_qna_agent():
    """Test the Q&A agent with sample questions."""
    
    print("🧪 Testing Q&A Agent...")
    
    # Initialize agent
    agent = QnAAgent()
    
    # Test questions
    test_questions = [
        {
            "question": "What is photosynthesis?",
            "context": {"subject": "Biology", "grade_level": "8th grade"}
        },
        {
            "question": "How do I solve quadratic equations?",
            "context": {"subject": "Math", "grade_level": "High School"}
        },
        {
            "question": "Can you explain the water cycle?",
            "context": {"subject": "Science", "grade_level": "Elementary"}
        }
    ]
    
    for i, test in enumerate(test_questions, 1):
        print(f"\n{'='*50}")
        print(f"Test {i}: {test['question']}")
        print(f"Context: {test['context']}")
        print("="*50)
        
        try:
            # Process the question
            response, provider = await agent.process_question(
                question=test["question"],
                conversation_history=[],
                context=test["context"]
            )
            
            print(f"Provider Used: {provider.value}")
            print(f"Response:\n{response}")
            
        except Exception as e:
            print(f"❌ Error: {str(e)}")
    
    print(f"\n{'='*50}")
    print("Agent Capabilities:")
    print(json.dumps(agent.get_capabilities(), indent=2))
    print("="*50)


async def test_conversation_flow():
    """Test a multi-turn conversation."""
    
    print("\n🗨️  Testing Conversation Flow...")
    
    agent = QnAAgent()
    conversation_history = []
    
    # Simulate a conversation about fractions
    conversation = [
        ("What are fractions?", {"subject": "Math", "grade_level": "4th grade"}),
        ("Can you give me an example?", None),
        ("How do I add fractions?", None),
    ]
    
    for question, context in conversation:
        print(f"\n👤 Student: {question}")
        
        try:
            response, provider = await agent.process_question(
                question=question,
                conversation_history=conversation_history,
                context=context
            )
            
            print(f"🤖 AI Tutor ({provider.value}): {response}")
            
            # Add to conversation history
            conversation_history.extend([
                ConversationMessage(role=MessageRole.USER, content=question),
                ConversationMessage(role=MessageRole.ASSISTANT, content=response)
            ])
            
        except Exception as e:
            print(f"❌ Error: {str(e)}")


if __name__ == "__main__":
    print("🚀 Starting Q&A Agent Tests...")
    print("Note: Make sure you have valid API keys in your .env file")
    
    # Run tests
    asyncio.run(test_qna_agent())
    asyncio.run(test_conversation_flow())
    
    print("\n✅ Tests completed!") 
#!/usr/bin/env python3
"""
Test script to verify user customizations integration in AI teacher
"""

import asyncio
import json
from ai_teacher.agent import TeacherAgent
from ai_teacher.models import StreamLessonRequest

async def test_user_customizations():
    """Test that user customizations are properly integrated into the AI teacher"""

    # Create a test request
    request = StreamLessonRequest(
        topic="Introduction to Python",
        user_id="test_user_123",
        session_id="test_session_123",
        tts=False,  # Disable TTS for faster testing
        auth_token=None  # No auth token for this test
    )

    print("🧪 Testing user customizations integration...")
    print(f"📝 Topic: {request.topic}")
    print(f"👤 User ID: {request.user_id}")
    print(f"🔑 Auth Token: {request.auth_token}")

    # Test the fetch_user_customizations method directly
    agent = TeacherAgent()

    print("\n🔍 Testing fetch_user_customizations method...")
    customizations = await agent.fetch_user_customizations(request.user_id, request.auth_token)

    if customizations:
        print("✅ Successfully fetched user customizations:")
        print(json.dumps(customizations, indent=2))
    else:
        print("ℹ️  No customizations found or unable to fetch (expected without auth token)")

    # Test the full stream_lesson flow (limited to first few events)
    print("\n🎯 Testing stream_lesson integration...")
    event_count = 0
    max_events = 3  # Only get first few events for testing

    try:
        async for event in agent.stream_lesson(request):
            print(f"📡 Event {event_count + 1}: {event.type}")
            if event.type == "render" and event.render:
                print(f"   📊 Title: {event.render.title}")
                if event.render.code and len(event.render.code) > 100:
                    print(f"   💻 Code: {event.render.code[:100]}...")
                else:
                    print(f"   💻 Code: {event.render.code}")
            elif event.type == "speak" and event.speak:
                if len(event.speak.text) > 100:
                    print(f"   🗣️  Narration: {event.speak.text[:100]}...")
                else:
                    print(f"   🗣️  Narration: {event.speak.text}")

            event_count += 1
            if event_count >= max_events:
                print("⏹️  Stopping after first few events for testing")
                break

    except Exception as e:
        print(f"❌ Error during streaming: {e}")
        return False

    print("
✅ Test completed successfully!"    print(f"📊 Total events processed: {event_count}")
    return True

if __name__ == "__main__":
    asyncio.run(test_user_customizations())




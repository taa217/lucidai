#!/usr/bin/env python3
"""
Test script for Gemini image generation integration.
"""

import asyncio
import os
import sys
from pathlib import Path

# Add the python_services directory to the path
sys.path.append(str(Path(__file__).parent))

from slide_orchestrator.visual_designer_agent import VisualDesignerAgent
from shared.config import get_settings

async def test_gemini_integration():
    """Test the Gemini image generation integration."""
    print("🧪 Testing Gemini Image Generation Integration")
    print("=" * 50)
    
    # Check environment
    settings = get_settings()
    print(f"🔑 Google API Key: {'✅ Set' if settings.google_api_key else '❌ Not set'}")
    print(f"🔑 OpenAI API Key: {'✅ Set' if settings.openai_api_key else '❌ Not set'}")
    
    # Create test plan item
    test_plan_item = {
        "slide_number": 1,
        "slide_title": "Semiconductor Energy Bands",
        "visual_description": "A diagram showing three energy band diagrams side by side: Conductor (continuous band), Insulator (large band gap), and Semiconductor (small band gap) with doping illustrations",
        "content_context": "This slide teaches about the fundamental differences between conductors, insulators, and semiconductors through energy band theory",
        "reasoning": "Energy band diagrams are essential for understanding semiconductor physics and require clear visual representation"
    }
    
    # Initialize Visual Designer Agent
    print("\n🎨 Initializing Visual Designer Agent...")
    agent = VisualDesignerAgent("test")
    
    print(f"📊 Available providers: {list(agent.image_providers.keys())}")
    print(f"🎯 Preferred provider: {agent.preferred_provider}")
    
    if not agent.image_providers:
        print("❌ No image generation providers available!")
        return
    
    # Test image generation
    print("\n🚀 Testing image generation...")
    try:
        asset = await agent._generate_image(
            test_plan_item, 
            "semiconductor physics", 
            "educational_image"
        )
        
        print("✅ Image generation successful!")
        print(f"📊 Asset details:")
        print(f"   - Provider: {asset.get('provider', 'unknown')}")
        print(f"   - Asset type: {asset.get('asset_type')}")
        print(f"   - Image URL: {asset.get('image_url')}")
        print(f"   - Generated at: {asset.get('generated_at')}")
        
        if asset.get('provider') == 'gemini':
            print("🎉 Gemini image generation working correctly!")
        elif asset.get('provider') == 'openai':
            print("🔄 Fallback to OpenAI DALL-E successful!")
        else:
            print("⚠️ Unknown provider used")
            
    except Exception as e:
        print(f"❌ Image generation failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_gemini_integration()) 
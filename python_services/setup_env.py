#!/usr/bin/env python3
"""
Environment Setup Script for Lucid Learn AI
Helps users configure their environment variables
"""

import os
import shutil
from pathlib import Path

def setup_environment():
    """Setup environment variables for Lucid Learn AI"""
    print("🔧 Lucid Learn AI - Environment Setup")
    print("=" * 50)
    
    # Check if .env already exists
    env_file = Path('.env')
    env_example = Path('env.example')
    
    if not env_example.exists():
        print("❌ env.example file not found!")
        print("Please ensure you're running this from the python_services directory.")
        return False
    
    if env_file.exists():
        print("📄 .env file already exists")
        choice = input("Do you want to overwrite it? (y/N): ").lower().strip()
        if choice != 'y':
            print("Keeping existing .env file")
            return True
    
    # Copy env.example to .env
    try:
        shutil.copy2(env_example, env_file)
        print("✅ Created .env file from env.example")
    except Exception as e:
        print(f"❌ Failed to create .env file: {e}")
        return False
    
    print("\n🔑 API Key Configuration")
    print("=" * 30)
    print("The .env file contains example API keys. For the system to work properly,")
    print("you need to add your own API keys for at least one of these providers:")
    print()
    print("1. OpenAI (https://platform.openai.com/api-keys)")
    print("   - Set OPENAI_API_KEY in .env file")
    print()
    print("2. Anthropic (https://console.anthropic.com/)")
    print("   - Set ANTHROPIC_API_KEY in .env file")
    print()
    print("3. Google AI (https://makersuite.google.com/app/apikey)")
    print("   - Set GOOGLE_AI_KEY in .env file")
    print()
    
    # Check current environment variables
    print("📊 Current Environment Status:")
    providers = {
        'OpenAI': os.getenv('OPENAI_API_KEY'),
        'Anthropic': os.getenv('ANTHROPIC_API_KEY'),
        'Google AI': os.getenv('GOOGLE_AI_KEY')
    }
    
    available_count = 0
    for provider, key in providers.items():
        status = "✅ Available" if key and len(key) > 10 else "❌ Not configured"
        print(f"  {provider}: {status}")
        if key and len(key) > 10:
            available_count += 1
    
    print(f"\n📈 {available_count}/3 providers configured")
    
    if available_count == 0:
        print("\n⚠️  WARNING: No API keys detected!")
        print("The system will not work without at least one valid API key.")
        print("Please edit the .env file and add your API keys.")
        print()
        print("After adding your API keys, restart the terminal or run:")
        print("  source .env  # On Linux/Mac")
        print("  # Or restart your terminal on Windows")
    elif available_count < 3:
        print(f"\n💡 TIP: You have {available_count} provider(s) configured.")
        print("The system will work, but having multiple providers improves reliability.")
    else:
        print("\n🎉 All providers configured! You're ready to go!")
    
    print("\n🚀 Next Steps:")
    if available_count == 0:
        print("1. Edit .env file and add your API keys")
        print("2. Restart terminal or reload environment")
        print("3. Run: python start_all_services.py")
    else:
        print("1. Run: python start_all_services.py")
        print("2. The system should start successfully!")
    
    return True

if __name__ == "__main__":
    setup_environment() 
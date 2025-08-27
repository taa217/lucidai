#!/usr/bin/env python3
"""
Installation script for Lucid Learn AI Python dependencies
Handles common installation issues and provides helpful feedback
"""

import subprocess
import sys
import os
from pathlib import Path

def check_python_version():
    """Check if Python version is compatible"""
    version = sys.version_info
    if version.major < 3 or (version.major == 3 and version.minor < 8):
        print(f"❌ Python {version.major}.{version.minor} detected. Python 3.8+ required.")
        print("Please upgrade Python and try again.")
        return False
    
    print(f"✅ Python {version.major}.{version.minor}.{version.micro} - Compatible")
    
    # Special handling for Python 3.13
    if version.major == 3 and version.minor >= 13:
        print("⚠️  Python 3.13+ detected - some packages may need compilation from source")
        print("   This is normal for very new Python versions")
    
    return True

def install_problematic_packages():
    """Install packages that commonly fail on newer Python versions"""
    problematic_packages = [
        "Pillow",  # Use latest version instead of pinned
        "numpy",   # Use latest compatible version
        "pandas"   # Use latest compatible version
    ]
    
    print("\n🔧 Installing potentially problematic packages individually...")
    
    for package in problematic_packages:
        try:
            print(f"   Installing {package}...")
            subprocess.run([sys.executable, "-m", "pip", "install", "--upgrade", package], 
                          check=True, capture_output=True, text=True)
            print(f"   ✅ {package} installed successfully")
        except subprocess.CalledProcessError as e:
            print(f"   ⚠️  {package} failed, will try with requirements.txt")

def install_requirements():
    """Install requirements with proper error handling"""
    if not check_python_version():
        return False
    
    # Change to the correct directory
    script_dir = Path(__file__).parent
    os.chdir(script_dir)
    
    print("\n🚀 Starting installation of Python dependencies...")
    print("📍 Location:", os.getcwd())
    
    try:
        # Upgrade pip first
        print("\n📦 Upgrading pip...")
        subprocess.run([sys.executable, "-m", "pip", "install", "--upgrade", "pip"], 
                      check=True, capture_output=True, text=True)
        
        # Install problematic packages first
        install_problematic_packages()
        
        # Install requirements
        print("\n📚 Installing all requirements...")
        result = subprocess.run([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"], 
                               check=True, capture_output=True, text=True)
        
        print("✅ All dependencies installed successfully!")
        print("\n🎯 Next steps:")
        print("1. Set up your environment variables (copy env.example to .env)")
        print("2. Add your API keys to the .env file")
        print("3. Run: python start_all_services.py")
        
        return True
        
    except subprocess.CalledProcessError as e:
        print(f"\n❌ Installation failed!")
        print(f"Error: {e}")
        
        # More specific error handling
        if "pillow" in str(e.stderr).lower() or "pillow" in str(e.stdout).lower():
            print("\n💡 Pillow installation issue detected:")
            print("This is common with Python 3.13. Try these solutions:")
            print("1. pip install --upgrade pip setuptools wheel")
            print("2. pip install Pillow --no-cache-dir")
            print("3. Or install without Pillow: comment out Pillow in requirements.txt")
            
        elif "wheel" in str(e.stderr).lower():
            print("\n💡 Wheel compilation issue detected:")
            print("Try installing build tools:")
            print("pip install --upgrade pip setuptools wheel")
            
        elif "pinecone" in str(e.stderr).lower():
            print("\n💡 Pinecone installation tip:")
            print("Try installing without pinecone first, then install it separately:")
            print("pip install pinecone-client==3.2.2")
        
        print(f"\nFull error output:\n{e.stderr}")
        return False

def alternative_installation():
    """Alternative installation method for problematic environments"""
    print("\n🔄 Trying alternative installation method...")
    
    essential_packages = [
        "fastapi", "uvicorn", "pydantic", "langchain", "langchain-openai", 
        "langchain-anthropic", "openai", "anthropic", "python-dotenv"
    ]
    
    try:
        for package in essential_packages:
            print(f"Installing {package}...")
            subprocess.run([sys.executable, "-m", "pip", "install", package], 
                          check=True, capture_output=True, text=True)
        
        print("✅ Essential packages installed!")
        print("⚠️  Some optional packages may be missing. You can install them manually later.")
        return True
        
    except subprocess.CalledProcessError:
        print("❌ Alternative installation also failed.")
        return False

if __name__ == "__main__":
    print("🎓 Lucid Learn AI - Dependency Installation")
    print("=" * 50)
    
    success = install_requirements()
    
    if not success:
        print("\n🔄 Trying alternative installation method...")
        success = alternative_installation()
    
    if success:
        print("\n🎉 Installation completed successfully!")
        print("\n📋 Quick verification - testing imports...")
        
        # Test critical imports
        try:
            import fastapi
            import langchain
            print("✅ Core packages are working!")
        except ImportError as e:
            print(f"⚠️  Import test failed: {e}")
            
        sys.exit(0)
    else:
        print("\n💥 Installation failed. Please try manual installation:")
        print("pip install fastapi uvicorn pydantic langchain langchain-openai openai anthropic python-dotenv")
        sys.exit(1) 
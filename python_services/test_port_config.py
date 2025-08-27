#!/usr/bin/env python3
"""
Test script to debug port configuration issues
"""

import os
import sys
sys.path.append(os.path.join(os.path.dirname(__file__)))

from shared.config import get_settings

def test_port_config():
    print("🔍 Testing port configuration...")
    print(f"Environment variables:")
    print(f"  QNA_SERVICE_PORT: {os.getenv('QNA_SERVICE_PORT', 'Not set')}")
    print(f"  SERVICE_PORT: {os.getenv('SERVICE_PORT', 'Not set')}")
    print(f"  DOCUMENT_PROCESSOR_PORT: {os.getenv('DOCUMENT_PROCESSOR_PORT', 'Not set')}")
    print(f"  ORCHESTRATOR_PORT: {os.getenv('ORCHESTRATOR_PORT', 'Not set')}")
    
    print(f"\nLoading settings...")
    settings = get_settings()
    print(f"  Service Port: {settings.service_port}")
    print(f"  Service Name: {settings.service_name}")
    
    # Test with QNA_SERVICE_PORT set
    print(f"\nTesting with QNA_SERVICE_PORT=8001...")
    os.environ['QNA_SERVICE_PORT'] = '8001'
    
    # Create new settings instance
    from shared.config import Settings
    test_settings = Settings()
    print(f"  Service Port: {test_settings.service_port}")

if __name__ == "__main__":
    test_port_config() 
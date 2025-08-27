"""
Shared configuration for all AI services.
"""

import os
from typing import Optional
from pathlib import Path
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings

# Try to load environment variables from python_services/.env, regardless of CWD
try:
    from dotenv import load_dotenv, find_dotenv

    base_dir = Path(__file__).resolve().parents[1]  # points to python_services/
    dotenv_path = base_dir / ".env"
    example_path = base_dir / "env.example"

    loaded = False
    if dotenv_path.exists():
        # Override any stale OS env vars with the ones in .env
        load_dotenv(dotenv_path, override=True)
        print(f"✅ Loaded environment variables from {dotenv_path}")
        loaded = True
    else:
        # Fallback: search upwards from CWD
        discovered = find_dotenv(usecwd=True)
        if discovered:
            load_dotenv(discovered, override=True)
            print(f"✅ Loaded environment variables from {discovered}")
            loaded = True

    # As a last resort, load env.example (does not override real env values)
    if not loaded and example_path.exists():
        load_dotenv(example_path, override=False)
        print(f"✅ Loaded environment variables from sample {example_path}")
    if not loaded and not example_path.exists():
        print("⚠️ No .env or env.example file found")
except ImportError:
    print("⚠️ python-dotenv not installed, using system environment variables only")


class Settings(BaseSettings):
    """Application settings with environment variable support."""
    
    # API Keys - explicitly map environment variables
    openai_api_key: Optional[str] = Field(default=None, alias='OPENAI_API_KEY')
    openai_organization: Optional[str] = Field(default=None, alias='OPENAI_ORG_ID')
    openai_project: Optional[str] = Field(default=None, alias='OPENAI_PROJECT')
    openai_model: str = Field(default="gpt-5-2025-08-07", alias='OPENAI_MODEL')
    anthropic_api_key: Optional[str] = Field(default=None, alias='ANTHROPIC_API_KEY')
    google_api_key: Optional[str] = Field(default=None, alias='GOOGLE_AI_KEY')
    
    # Service Configuration
    service_name: str = Field(default="ai-service", alias='SERVICE_NAME')
    service_port: int = Field(default=8000)
    debug: bool = Field(default=False, alias='DEBUG')
    
    # Database (for future use)
    database_url: Optional[str] = Field(default=None, alias='DATABASE_URL')
    
    # Inter-service Communication
    main_server_url: str = Field(default="http://localhost:3000", alias='MAIN_SERVER_URL')
    
    # Logging
    log_level: str = Field(default="INFO", alias='LOG_LEVEL')
    
    lead_agent_model: str = Field(default="claude-3-7-sonnet-20250219", alias="LEAD_AGENT_MODEL")
    research_agent_model: str = Field(default="claude-sonnet-4-20250514", alias="RESEARCH_AGENT_MODEL")
    perplexity_api_key: Optional[str] = Field(default=None, alias='PERPLEXITY_API_KEY')
    perplexity_model: str = Field(default="sonar-reasoning", alias="PERPLEXITY_MODEL")
    
    class Config:
        env_file = ".env"
        case_sensitive = False
        populate_by_name = True  # Allow both field name and alias
        extra = "ignore"  # Allow extra fields without validation error
    
    def __init__(self, **data):
        super().__init__(**data)
        # Check for service-specific port environment variables
        if os.getenv('QNA_SERVICE_PORT'):
            self.service_port = int(os.getenv('QNA_SERVICE_PORT'))
        elif os.getenv('DOCUMENT_PROCESSOR_PORT'):
            self.service_port = int(os.getenv('DOCUMENT_PROCESSOR_PORT'))
        elif os.getenv('ORCHESTRATOR_PORT'):
            self.service_port = int(os.getenv('ORCHESTRATOR_PORT'))
        elif os.getenv('SERVICE_PORT'):
            self.service_port = int(os.getenv('SERVICE_PORT'))


# Global settings instance
settings = Settings()


def get_settings() -> Settings:
    """Get the current settings instance."""
    return settings


def debug_settings():
    """Debug function to print current settings."""
    settings = get_settings()
    print("🔍 Current Settings:")
    print(f"  OpenAI API Key: {'✅ Set' if settings.openai_api_key else '❌ Not set'}")
    print(f"  Anthropic API Key: {'✅ Set' if settings.anthropic_api_key else '❌ Not set'}")
    print(f"  Google API Key: {'✅ Set' if settings.google_api_key else '❌ Not set'}")
    print(f"  Service Name: {settings.service_name}")
    print(f"  Service Port: {settings.service_port}")
    print(f"  Debug Mode: {settings.debug}")
    print(f"  Log Level: {settings.log_level}")
    
    if settings.openai_api_key:
        print(f"  OpenAI Key Preview: {settings.openai_api_key[:10]}...")
    if settings.anthropic_api_key:
        print(f"  Anthropic Key Preview: {settings.anthropic_api_key[:10]}...") 
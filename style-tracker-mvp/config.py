from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    openrouter_api_key: str
    deepseek_api_key: str
    supabase_url: str
    supabase_service_role_key: str
    storage_bucket: str = "documents"
    presigned_url_expiry: int = 900


settings = Settings()

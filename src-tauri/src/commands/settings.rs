use crate::models::{AgentSettings, UserSettings};
use crate::storage;

pub fn get_user_settings() -> UserSettings {
    log::debug!("[settings] get_user_settings");
    storage::settings::get_user_settings()
}

pub fn update_user_settings(patch: serde_json::Value) -> Result<UserSettings, String> {
    log::debug!("[settings] update_user_settings");
    storage::settings::update_user_settings(patch)
}

pub fn get_agent_settings(agent: String) -> AgentSettings {
    log::debug!("[settings] get_agent_settings: agent={}", agent);
    storage::settings::get_agent_settings(&agent)
}

pub fn update_agent_settings(
    agent: String,
    patch: serde_json::Value,
) -> Result<AgentSettings, String> {
    log::debug!("[settings] update_agent_settings: agent={}", agent);
    storage::settings::update_agent_settings(&agent, patch)
}

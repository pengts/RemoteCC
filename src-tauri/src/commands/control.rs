use crate::agent::control::{self, CliInfoCache};
use crate::models::CliInfo;

pub async fn get_cli_info(
    cache: &CliInfoCache,
    force_refresh: Option<bool>,
) -> Result<CliInfo, String> {
    log::debug!(
        "[control] get_cli_info IPC, force={}",
        force_refresh.unwrap_or(false)
    );
    match control::get_cli_info(&cache, force_refresh.unwrap_or(false)).await {
        Ok(info) => Ok(info),
        Err(e) => {
            log::warn!(
                "[control] CLI info failed ({}): {}, using fallback",
                e.code,
                e.message
            );
            Ok(control::fallback_cli_info())
        }
    }
}

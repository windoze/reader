use std::fs;

use anyhow::{Context, Result};
use rusqlite::OptionalExtension;

use super::{types::ReaderSettings, Storage};

impl Storage {
    pub fn get_settings(&self) -> Result<Option<ReaderSettings>> {
        if self.settings_path.exists() {
            return Ok(Some(self.read_settings_file()?));
        }

        let settings = self.legacy_db_settings()?.unwrap_or_default();
        self.write_settings_file(&settings)?;
        Ok(Some(settings))
    }

    pub fn save_settings(&mut self, settings: ReaderSettings) -> Result<()> {
        self.write_settings_file(&settings)
    }

    fn read_settings_file(&self) -> Result<ReaderSettings> {
        let content = fs::read_to_string(&self.settings_path).with_context(|| {
            format!(
                "failed to read settings file {}",
                self.settings_path.display()
            )
        })?;
        serde_json::from_str(&content).with_context(|| {
            format!(
                "failed to parse settings file {}",
                self.settings_path.display()
            )
        })
    }

    fn write_settings_file(&self, settings: &ReaderSettings) -> Result<()> {
        let content = serde_json::to_string_pretty(settings)?;
        let temporary_path = self.settings_path.with_extension("json.tmp");

        fs::write(&temporary_path, content).with_context(|| {
            format!("failed to write settings file {}", temporary_path.display())
        })?;
        fs::rename(&temporary_path, &self.settings_path).with_context(|| {
            format!(
                "failed to update settings file {}",
                self.settings_path.display()
            )
        })?;
        Ok(())
    }

    fn legacy_db_settings(&self) -> Result<Option<ReaderSettings>> {
        let json: Option<String> = self
            .library
            .query_row(
                "SELECT value_json FROM settings WHERE key = 'reader'",
                [],
                |row| row.get(0),
            )
            .optional()?;

        json.map(|value| serde_json::from_str(&value).map_err(Into::into))
            .transpose()
    }
}

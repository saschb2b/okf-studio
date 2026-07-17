use keyring::Entry;
use zeroize::Zeroizing;

const SERVICE: &str = "app.okfviewer.desktop";

pub(crate) trait CredentialStore {
    fn set(&self, profile_id: &str, secret: &str) -> Result<(), String>;
    fn get(&self, profile_id: &str) -> Result<Zeroizing<String>, String>;
    fn delete(&self, profile_id: &str) -> Result<(), String>;
}

pub(crate) struct OsCredentialStore;

impl CredentialStore for OsCredentialStore {
    fn set(&self, profile_id: &str, secret: &str) -> Result<(), String> {
        entry(profile_id)?
            .set_password(secret)
            .map_err(|_| credential_error("save"))
    }

    fn get(&self, profile_id: &str) -> Result<Zeroizing<String>, String> {
        entry(profile_id)?
            .get_password()
            .map(Zeroizing::new)
            .map_err(|_| {
                "Studio could not read this profile's API key from the operating-system credential store. Recreate the endpoint profile."
                    .to_string()
            })
    }

    fn delete(&self, profile_id: &str) -> Result<(), String> {
        match entry(profile_id)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(_) => Err(credential_error("remove")),
        }
    }
}

fn entry(profile_id: &str) -> Result<Entry, String> {
    Entry::new(SERVICE, &format!("studio-agent:{profile_id}")).map_err(|_| credential_error("open"))
}

fn credential_error(action: &str) -> String {
    format!(
        "Studio could not {action} the API key in the operating-system credential store. Check that the credential service is available and unlocked."
    )
}

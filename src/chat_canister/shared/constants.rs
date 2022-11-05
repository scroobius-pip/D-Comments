use std::option_env;
use dotenv_codegen::dotenv;

// Define TREASURY_CANISTER_ID_DEV OR fallback to TREASURY_CANISTER_ID, one of them must be defined, but not both
pub const TREASURY_CANISTER_ID: &str = {
    match option_env!("TREASURY_CANISTER_ID_DEV") {
        Some(id) => {
            if id.is_empty() {
                dotenv!("TREASURY_CANISTER_ID")
            } else {
                id
            }
        }
        _ => dotenv!("TREASURY_CANISTER_ID"),
    }
};

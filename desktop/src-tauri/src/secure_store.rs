//! Encrypt-at-rest for small secrets (currently: the live-site session
//! token) saved into engine-config.json. On Windows this uses DPAPI
//! (CryptProtectData/CryptUnprotectData) with no explicit entropy, which
//! binds the ciphertext to the current Windows user account — Windows
//! itself refuses to unprotect it under any other account. Non-Windows
//! builds (dev-only; the shipped app is Windows-only per the installer)
//! fall back to a no-op passthrough so the code still compiles and runs
//! for local editing on other platforms.

#[cfg(target_os = "windows")]
mod windows_dpapi {
    use windows::Win32::Foundation::LocalFree;
    use windows::Win32::Security::Cryptography::{
        CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
    };

    /// Wraps a DPAPI output blob so its Windows-allocated buffer is always
    /// freed via LocalFree, even on early return.
    struct OwnedBlob(CRYPT_INTEGER_BLOB);

    impl Drop for OwnedBlob {
        fn drop(&mut self) {
            if !self.0.pbData.is_null() {
                unsafe {
                    let _ = LocalFree(windows::Win32::Foundation::HLOCAL(
                        self.0.pbData as *mut _,
                    ));
                }
            }
        }
    }

    fn blob_to_vec(blob: &CRYPT_INTEGER_BLOB) -> Vec<u8> {
        if blob.pbData.is_null() || blob.cbData == 0 {
            return Vec::new();
        }
        unsafe { std::slice::from_raw_parts(blob.pbData, blob.cbData as usize).to_vec() }
    }

    pub fn protect(plaintext: &[u8]) -> Result<Vec<u8>, String> {
        let mut input = CRYPT_INTEGER_BLOB {
            cbData: plaintext.len() as u32,
            pbData: plaintext.as_ptr() as *mut u8,
        };
        let mut output = CRYPT_INTEGER_BLOB::default();
        unsafe {
            CryptProtectData(
                &mut input,
                None,
                None,
                None,
                None,
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
            .map_err(|e| format!("CryptProtectData failed: {e}"))?;
        }
        let owned = OwnedBlob(output);
        Ok(blob_to_vec(&owned.0))
    }

    pub fn unprotect(ciphertext: &[u8]) -> Result<Vec<u8>, String> {
        let mut input = CRYPT_INTEGER_BLOB {
            cbData: ciphertext.len() as u32,
            pbData: ciphertext.as_ptr() as *mut u8,
        };
        let mut output = CRYPT_INTEGER_BLOB::default();
        unsafe {
            CryptUnprotectData(
                &mut input,
                None,
                None,
                None,
                None,
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut output,
            )
            .map_err(|e| format!("CryptUnprotectData failed: {e}"))?;
        }
        let owned = OwnedBlob(output);
        Ok(blob_to_vec(&owned.0))
    }
}

#[cfg(not(target_os = "windows"))]
mod windows_dpapi {
    pub fn protect(plaintext: &[u8]) -> Result<Vec<u8>, String> {
        Ok(plaintext.to_vec())
    }
    pub fn unprotect(ciphertext: &[u8]) -> Result<Vec<u8>, String> {
        Ok(ciphertext.to_vec())
    }
}

/// Encrypt `plaintext` and base64-encode it for storage in the JSON config.
pub fn protect_to_base64(plaintext: &str) -> Result<String, String> {
    let cipher = windows_dpapi::protect(plaintext.as_bytes())?;
    Ok(base64::Engine::encode(
        &base64::engine::general_purpose::STANDARD,
        cipher,
    ))
}

/// Reverse of `protect_to_base64`.
pub fn unprotect_from_base64(encoded: &str) -> Result<String, String> {
    let cipher = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, encoded)
        .map_err(|e| format!("invalid stored session (base64): {e}"))?;
    let plain = windows_dpapi::unprotect(&cipher)?;
    String::from_utf8(plain).map_err(|e| format!("invalid stored session (utf8): {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trips_a_realistic_session_token() {
        let token = "kilrun_sess_abcDEF123.eyJhbGciOiJIUzI1NiJ9.signature-looking-thing";
        let encoded = protect_to_base64(token).expect("protect should succeed");
        // On Windows this must actually be encrypted, not just base64 of the
        // plaintext — assert the ciphertext bytes don't contain the raw
        // token, so a regression that accidentally no-ops DPAPI is caught.
        #[cfg(target_os = "windows")]
        {
            let raw = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, &encoded)
                .unwrap();
            let raw_str = String::from_utf8_lossy(&raw);
            assert!(
                !raw_str.contains(token),
                "ciphertext must not contain the plaintext token"
            );
        }
        let decoded = unprotect_from_base64(&encoded).expect("unprotect should succeed");
        assert_eq!(decoded, token);
    }

    #[test]
    fn rejects_garbage_instead_of_panicking() {
        assert!(unprotect_from_base64("not valid base64 at all !!").is_err());
    }
}

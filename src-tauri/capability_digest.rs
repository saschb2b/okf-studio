use sha2::{Digest, Sha256};

pub(crate) fn sha256(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

pub(crate) fn sha256_resource(bytes: &[u8], media_type: &str) -> String {
    if matches!(
        media_type,
        "text/markdown" | "application/json" | "application/schema+json"
    ) {
        return sha256(&normalize_line_endings(bytes));
    }
    sha256(bytes)
}

fn normalize_line_endings(bytes: &[u8]) -> Vec<u8> {
    let mut normalized = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'\r' && bytes.get(index + 1) == Some(&b'\n') {
            normalized.push(b'\n');
            index += 2;
        } else {
            normalized.push(bytes[index]);
            index += 1;
        }
    }
    normalized
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn text_resource_digest_is_stable_across_checkout_line_endings() {
        let lf = b"heading\nbody\n";
        let crlf = b"heading\r\nbody\r\n";
        let mixed = b"heading\r\nbody\n";

        let expected = sha256_resource(lf, "text/markdown");
        assert_eq!(sha256_resource(crlf, "text/markdown"), expected);
        assert_eq!(sha256_resource(mixed, "text/markdown"), expected);
        assert_eq!(sha256_resource(crlf, "application/json"), expected);
        assert_eq!(sha256_resource(crlf, "application/schema+json"), expected);
    }

    #[test]
    fn unknown_binary_media_type_remains_byte_exact() {
        assert_ne!(
            sha256_resource(b"a\nb", "application/octet-stream"),
            sha256_resource(b"a\r\nb", "application/octet-stream")
        );
    }
}

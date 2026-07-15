use std::io::Read;
use std::net::{IpAddr, SocketAddr, ToSocketAddrs};
use std::time::Duration;
use url::{Host, Url};

use crate::agent_sources::{self, AgentSourceInput};

const MAX_URL_CHARS: usize = agent_sources::MAX_SOURCE_ORIGIN_CHARS;
const MAX_BODY_BYTES: u64 = agent_sources::MAX_SOURCE_CONTENT_CHARS as u64;
const MAX_REDIRECTS: u32 = 3;

pub(crate) fn fetch(input: String) -> Result<AgentSourceInput, String> {
    let requested_url = validate_url(&input)?;
    let agent = ureq::AgentBuilder::new()
        .https_only(true)
        .redirects(MAX_REDIRECTS)
        .try_proxy_from_env(false)
        .resolver(secure_resolve)
        .timeout_connect(Duration::from_secs(10))
        .timeout_read(Duration::from_secs(20))
        .timeout_write(Duration::from_secs(10))
        .user_agent(concat!("okf-studio/", env!("CARGO_PKG_VERSION")))
        .build();

    let response = agent
        .get(requested_url.as_str())
        .call()
        .map_err(fetch_error)?;
    let final_url = validate_url(response.get_url())?;
    let media_type = response
        .header("content-type")
        .and_then(supported_media_type)
        .ok_or_else(|| {
            "The URL must return an explicit supported Content-Type: plain text, Markdown, HTML, CSV, or JSON."
                .to_string()
        })?;
    if response
        .header("content-length")
        .and_then(|value| value.parse::<u64>().ok())
        .is_some_and(|length| length > MAX_BODY_BYTES)
    {
        return Err("The URL response exceeds the 256 KiB source limit.".to_string());
    }

    let title = title_for_url(&final_url);
    let mut bytes = Vec::new();
    response
        .into_reader()
        .take(MAX_BODY_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("Could not read the URL response: {error}"))?;
    if bytes.len() as u64 > MAX_BODY_BYTES {
        return Err("The URL response exceeds the 256 KiB source limit.".to_string());
    }

    agent_sources::source_from_bytes(title, final_url.to_string(), media_type, bytes, true)
}

fn validate_url(input: &str) -> Result<Url, String> {
    let input = input.trim();
    if input.is_empty() || input.chars().count() > MAX_URL_CHARS {
        return Err("Enter an HTTPS URL no longer than 2,048 characters.".to_string());
    }
    let mut url = Url::parse(input).map_err(|_| "Enter a valid HTTPS URL.".to_string())?;
    if url.scheme() != "https" {
        return Err("URL sources must use HTTPS.".to_string());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("URL sources cannot contain embedded credentials.".to_string());
    }
    match url.host() {
        Some(Host::Ipv4(address)) if !is_public_ip(IpAddr::V4(address)) => {
            return Err("URL sources cannot use private or special-use addresses.".to_string());
        }
        Some(Host::Ipv6(address)) if !is_public_ip(IpAddr::V6(address)) => {
            return Err("URL sources cannot use private or special-use addresses.".to_string());
        }
        Some(_) => {}
        None => return Err("The URL must include a host.".to_string()),
    }
    url.set_fragment(None);
    Ok(url)
}

fn secure_resolve(netloc: &str) -> std::io::Result<Vec<SocketAddr>> {
    let addresses = netloc.to_socket_addrs()?.collect::<Vec<_>>();
    if addresses.is_empty() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "the URL host did not resolve",
        ));
    }
    if addresses.iter().any(|address| !is_public_ip(address.ip())) {
        return Err(std::io::Error::new(
            std::io::ErrorKind::PermissionDenied,
            "private or special-use URL addresses are blocked",
        ));
    }
    Ok(addresses)
}

fn is_public_ip(address: IpAddr) -> bool {
    match address {
        IpAddr::V4(address) => {
            let [a, b, c, _] = address.octets();
            !matches!(
                (a, b, c),
                (0, _, _)
                    | (10, _, _)
                    | (100, 64..=127, _)
                    | (127, _, _)
                    | (169, 254, _)
                    | (172, 16..=31, _)
                    | (192, 0, 0)
                    | (192, 0, 2)
                    | (192, 168, _)
                    | (198, 18..=19, _)
                    | (198, 51, 100)
                    | (203, 0, 113)
                    | (224..=255, _, _)
            )
        }
        IpAddr::V6(address) => {
            let segments = address.segments();
            if let Some(mapped) = address.to_ipv4_mapped() {
                return is_public_ip(IpAddr::V4(mapped));
            }
            !address.is_unspecified()
                && !address.is_loopback()
                && !address.is_multicast()
                && segments[0] & 0xfe00 != 0xfc00
                && segments[0] & 0xffc0 != 0xfe80
                && segments[0] & 0xffc0 != 0xfec0
                && !(segments[0] == 0x2001 && segments[1] == 0x0db8)
        }
    }
}

fn supported_media_type(header: &str) -> Option<&'static str> {
    let media_type = header.split(';').next()?.trim().to_ascii_lowercase();
    match media_type.as_str() {
        "text/plain" => Some("text/plain"),
        "text/markdown" => Some("text/markdown"),
        "text/html" => Some("text/html"),
        "text/csv" => Some("text/csv"),
        "application/json" => Some("application/json"),
        value if value.starts_with("application/") && value.ends_with("+json") => {
            Some("application/json")
        }
        _ => None,
    }
}

fn title_for_url(url: &Url) -> String {
    let candidate = url
        .path_segments()
        .and_then(|mut segments| segments.rfind(|segment| !segment.is_empty()))
        .or_else(|| url.host_str())
        .unwrap_or("Web source");
    let title = candidate
        .chars()
        .filter(|character| !character.is_control())
        .take(agent_sources::MAX_SOURCE_TITLE_CHARS)
        .collect::<String>();
    if title.trim().is_empty() {
        "Web source".to_string()
    } else {
        title
    }
}

fn fetch_error(error: ureq::Error) -> String {
    match error {
        ureq::Error::Status(status, _) => format!("The URL returned HTTP status {status}."),
        ureq::Error::Transport(_) => {
            "The URL could not be fetched securely. Check the address and try again.".to_string()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_https_urls_and_removes_fragments() {
        let url = validate_url(" https://example.com/notes.md#section ").expect("valid URL");
        assert_eq!(url.as_str(), "https://example.com/notes.md");
        assert!(validate_url("http://example.com").is_err());
        assert!(validate_url("https://user:secret@example.com").is_err());
        assert!(validate_url("https://127.0.0.1/notes").is_err());
        assert!(validate_url(&format!("https://example.com/{}", "a".repeat(2_048))).is_err());
    }

    #[test]
    fn resolver_rejects_private_literal_addresses() {
        assert!(secure_resolve("127.0.0.1:443").is_err());
        assert!(secure_resolve("[::1]:443").is_err());
        assert_eq!(
            secure_resolve("93.184.216.34:443").expect("public address")[0].ip(),
            "93.184.216.34".parse::<IpAddr>().expect("IP")
        );
    }

    #[test]
    fn accepts_only_explicit_text_media_types() {
        assert_eq!(
            supported_media_type("text/html; charset=utf-8"),
            Some("text/html")
        );
        assert_eq!(
            supported_media_type("application/ld+json"),
            Some("application/json")
        );
        assert_eq!(supported_media_type("application/pdf"), None);
        assert_eq!(supported_media_type("application/octet-stream"), None);
    }

    #[test]
    fn recognizes_special_use_addresses() {
        for address in [
            "10.0.0.1",
            "100.64.0.1",
            "169.254.1.1",
            "172.16.0.1",
            "192.168.0.1",
            "198.51.100.1",
            "::1",
            "fc00::1",
            "fe80::1",
            "2001:db8::1",
            "::ffff:127.0.0.1",
        ] {
            assert!(!is_public_ip(address.parse().expect("IP")), "{address}");
        }
        assert!(is_public_ip("93.184.216.34".parse().expect("IP")));
        assert!(is_public_ip("2606:4700:4700::1111".parse().expect("IP")));
    }

    #[test]
    fn builds_bounded_titles_from_final_urls() {
        let url = Url::parse("https://example.com/research/notes.md?raw=1").expect("URL");
        assert_eq!(title_for_url(&url), "notes.md");
    }
}

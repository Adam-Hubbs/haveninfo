use biome_rowan::TextSize;

/// Converts UTF-16 code unit offsets (JS string indexing, e.g. from
/// `document.offsetAt()`) to the UTF-8 byte offsets Air's syntax tree uses.
///
/// Built once per document so each lookup is a binary search rather than a
/// walk over the source. Only non-ASCII characters are recorded: between them
/// the two encodings advance in lockstep.
#[derive(Debug)]
pub struct Utf16Index {
    /// `(utf16, utf8)` offsets at the start and end of every non-ASCII
    /// character, in pairs.
    checkpoints: Vec<(u32, u32)>,
    utf16_len: u32,
}

impl Utf16Index {
    pub fn new(source: &str) -> Self {
        let mut checkpoints = Vec::new();
        let mut utf16 = 0;
        for (utf8, ch) in source.char_indices() {
            let utf16_len = ch.len_utf16() as u32;
            if !ch.is_ascii() {
                let utf8 = utf8 as u32;
                checkpoints.push((utf16, utf8));
                checkpoints.push((utf16 + utf16_len, utf8 + ch.len_utf8() as u32));
            }
            utf16 += utf16_len;
        }
        Self {
            checkpoints,
            utf16_len: utf16,
        }
    }

    pub fn utf8_offset(&self, utf16_offset: u32) -> Option<TextSize> {
        if utf16_offset > self.utf16_len {
            return None;
        }
        let i = self
            .checkpoints
            .partition_point(|&(utf16, _)| utf16 <= utf16_offset);
        let utf8 = match i.checked_sub(1).map(|i| (i, self.checkpoints[i])) {
            None => utf16_offset,
            // Inside a surrogate pair: snap to the end of the character.
            Some((i, (utf16, _))) if i % 2 == 0 && utf16 < utf16_offset => {
                self.checkpoints[i + 1].1
            }
            Some((_, (utf16, utf8))) => utf8 + (utf16_offset - utf16),
        };
        Some(TextSize::from(utf8))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ascii_offsets_are_unchanged() {
        let index = Utf16Index::new("df$col");
        assert_eq!(index.utf8_offset(3), Some(TextSize::from(3)));
        assert_eq!(index.utf8_offset(6), Some(TextSize::from(6)));
        assert_eq!(index.utf8_offset(7), None);
    }

    #[test]
    fn accounts_for_multibyte_characters() {
        let source = "x <- \"é😀\"; df$col";
        let index = Utf16Index::new(source);
        let utf16 = source.encode_utf16().count() as u32 - 3;
        let col = TextSize::from(source.find("col").unwrap() as u32);
        assert_eq!(index.utf8_offset(utf16), Some(col));
        assert_eq!(index.utf8_offset(utf16 + 3), Some(TextSize::of(source)));
        assert_eq!(index.utf8_offset(utf16 + 4), None);
    }

    #[test]
    fn snaps_offsets_inside_surrogate_pairs_forward() {
        let source = "😀x";
        let index = Utf16Index::new(source);
        assert_eq!(index.utf8_offset(0), Some(TextSize::from(0)));
        assert_eq!(index.utf8_offset(1), Some(TextSize::from(4)));
        assert_eq!(index.utf8_offset(2), Some(TextSize::from(4)));
        assert_eq!(index.utf8_offset(3), Some(TextSize::from(5)));
    }
}

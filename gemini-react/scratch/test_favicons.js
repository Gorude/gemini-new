function getDomain(uri) {
  try {
    const cleanUri = uri.replace(/^(https?:\/\/)?(www\.)?/, 'https://');
    return new URL(cleanUri).hostname;
  } catch (e) {
    return '';
  }
}

const testUrls = [
  "https://www.google.com/search?q=test",
  "http://wikipedia.org",
  "github.com/trending",
  "www.amazon.com.br",
  "http://localhost:3000",
  "ftp://example.com"
];

testUrls.forEach(url => {
  const domain = getDomain(url);
  console.log(`URL: ${url.padEnd(40)} -> Domain: ${domain.padEnd(20)} -> Favicon: https://www.google.com/s2/favicons?domain=${domain}&sz=64`);
});

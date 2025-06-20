import '@testing-library/jest-dom'; // For jest-dom assertions (e.g., .toBeInTheDocument)

globalThis.fetch = jest.fn(() =>
  Promise.resolve({
    json: () => Promise.resolve({}),
  })
);

// Mock window.location.href in Jest tests (since jsdom doesn't support full navigation)
delete window.location;
window.location = { href: '' }; 


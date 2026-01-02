const crypto = require("crypto");

/**
 * Generate a cryptographically secure random password
 * that meets the application's password policy requirements
 * 
 * @param {number} length - Password length (default: 12)
 * @returns {string} Generated password
 */
function generateSecurePassword(length = 12) {
    // Ensure minimum length of 8 characters
    if (length < 8) {
        length = 8;
    }

    // Character sets for password generation
    const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const lowercase = "abcdefghijklmnopqrstuvwxyz";
    const numbers = "0123456789";
    const special = "@$!%*?&";

    // Ensure at least one character from each required category
    let password = "";
    password += uppercase[crypto.randomInt(0, uppercase.length)];
    password += numbers[crypto.randomInt(0, numbers.length)];
    password += special[crypto.randomInt(0, special.length)];
    
    // Fill the rest with random characters from all sets
    const allChars = uppercase + lowercase + numbers + special;
    for (let i = password.length; i < length; i++) {
        password += allChars[crypto.randomInt(0, allChars.length)];
    }

    // Shuffle the password to avoid predictable patterns
    password = password.split('').sort(() => crypto.randomInt(-1, 2)).join('');

    // Verify password meets requirements (should always pass)
    const passwordRegex = /^(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{6,}$/;
    if (!passwordRegex.test(password)) {
        // Recursively generate if somehow it doesn't meet requirements
        return generateSecurePassword(length);
    }

    return password;
}

module.exports = { generateSecurePassword };

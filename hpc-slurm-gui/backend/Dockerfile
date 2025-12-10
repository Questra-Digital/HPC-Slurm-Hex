# Use Node.js LTS version as the base image
FROM node:18

# Set working directory inside the container
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the application files
COPY . .

# Expose the port your app runs on (adjust if needed)
EXPOSE 5052

# Start the application
CMD ["node", "index.js"]

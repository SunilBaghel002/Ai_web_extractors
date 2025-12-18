# Use Apify's Playwright image with Chrome
FROM apify/actor-node-playwright-chrome:20

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev --omit=optional

# Copy source code
COPY . ./

# Set environment
ENV NODE_ENV=production

# Run the actor
CMD ["node", "src/main.js"]
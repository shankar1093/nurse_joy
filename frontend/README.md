# Nurse Joy 🏥

An AI-powered medical assistant designed to streamline the radiology scan preparation process. Built with Next.js and inspired by Vercel's AI chatbot template.

## Overview

Nurse Joy is an intelligent conversational agent that interviews patients before their radiology scans. It gathers relevant medical history, current symptoms, and other critical information to help radiology technicians make informed decisions about contrast medium administration.

## Features

- **Natural Conversational Interface**: Engages patients in a friendly, professional dialogue to collect medical information
- **Structured Data Collection**: Systematically gathers:
  - Current medications
  - Allergies and previous reactions
  - Kidney function history
  - Previous contrast medium exposure
  - Pregnancy status (if applicable)
  - Current symptoms
- **Intelligent Analysis**: Processes patient responses to identify potential contraindications
- **Clear Reporting**: Generates concise summaries for radiology technicians
- **Privacy-First Design**: Built with HIPAA compliance considerations
- **Mobile-Responsive Interface**: Accessible on any device

## Tech Stack

- Next.js 14 (App Router)
- TypeScript
- OpenAI API / Anthropic API
- Tailwind CSS
- Vercel AI SDK
- shadcn/ui Components

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- OpenAI API key or Anthropic API key

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/nurse_joy.git

# Navigate to project directory
cd nurse_joy

# Install dependencies
npm install

# Create environment file
cp .env.example .env.local
```

### Environment Variables

Add the following to your `.env.local`:

```
OPENAI_API_KEY=your_api_key_here
# or
ANTHROPIC_API_KEY=your_api_key_here

# Optional: Database URL if using persistent storage
DATABASE_URL=your_database_url
```

### Running the Development Server

```bash
npm run dev
```

Visit `http://localhost:3000` to see the application.

## Usage

1. Patient starts a new session
2. Nurse Joy introduces itself and begins gathering information
3. Through natural conversation, all necessary medical data is collected
4. A summary is generated for the radiology technician
5. Technician reviews the information to make an informed decision about contrast medium use

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details on our code of conduct and the process for submitting pull requests.

### Development Guidelines

- Follow TypeScript best practices
- Write tests for new features
- Maintain HIPAA compliance standards
- Document all new features and API changes

## Security & Privacy

- All patient data is handled according to HIPAA guidelines
- Data is not stored permanently unless explicitly configured
- Conversations are encrypted end-to-end
- Regular security audits are performed

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built on [Vercel's AI Chatbot](https://github.com/vercel/ai-chatbot) template
- Uses components from [shadcn/ui](https://ui.shadcn.com/)
- Inspired by the healthcare professionals who work tirelessly to provide quality patient care

## Support

For support, please open an issue in the GitHub repository or contact the maintainers at [support@nursejoy.com](mailto:support@nursejoy.com).

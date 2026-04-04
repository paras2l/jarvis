# Test Model - Personal AI Agent Application

A powerful personal AI agent application with voice control, task automation, and intelligent task execution capabilities.

## 🎯 Features

### Core Capabilities
- **Voice Activation**: "Hey [AppName]" wake word detection
- **Voice Commands**: Continuous voice command processing
- **Task Automation**: Execute any task on command
- **App Control**: Launch and control desktop/mobile applications
- **Message Sending**: Send messages via WhatsApp, SMS, and other apps
- **Call Management**: Make calls directly from voice commands
- **Multi-Agent System**: Create sub-agents for specific tasks
- **API Integration**: Connect multiple APIs for knowledge and actions
- **Dark Mode**: Cafe-themed aesthetic with light/dark mode toggle

### UI/UX
- **Cafe Aesthetic**: Cream and coffee color scheme
- **Responsive Design**: Works on desktop and mobile
- **Chat Interface**: ChatGPT-like conversation experience
- **Real-time Status**: Task execution monitoring
- **History Tracking**: Complete chat and task history

## 🚀 Quick Start

### Installation

```bash
cd test-model
npm install
```

### Development

```bash
npm run dev
```

Starts the development server at `http://localhost:5173`

### Native App Launching (Electron)

To launch installed desktop apps from commands, run the UI in Electron:

```bash
# terminal 1
npm run dev

# terminal 2
npm run electron-run
```

This enables a native bridge (IPC) so commands like "open notepad" can start local Windows apps.

### Assistive Screen-Control Launch Mode (Permission-Gated)

You can allow the agent to use UI-style app opening (Start menu search + Enter) instead of direct launch calls.

Commands:

```text
enable assistive mode
disable assistive mode
```

When enabled (Electron on Windows), app launch first tries assistive interaction, then falls back to native launch and web/protocol paths.

### Building

```bash
npm run build
```

Creates an optimized production build in the `dist` folder.

### Type Checking

```bash
npm run type-check
```

## 📁 Project Structure

```
src/
├── components/      # React components
├── pages/          # Page components
├── core/           # Core logic
│   ├── agent-engine.ts      (Agent management)
│   ├── task-executor.ts     (Command parsing & execution)
│   ├── voice-handler.ts     (Voice activation)
│   ├── api-gateway.ts       (API integration)
│   └── boundaries.ts        (Safety constraints)
├── styles/         # CSS theming
├── utils/          # Utility functions
├── types.ts        # TypeScript types
├── App.tsx         # Root component
└── main.tsx        # Entry point
```

## 🛠 Technology Stack

- **React 18** - UI framework
- **TypeScript** - Language
- **Vite** - Build tool
- **Web Speech API** - Voice recognition
- **CSS3** - Styling with custom properties

## 📝 Usage Examples

### Voice Commands

```
"Hey Paras, open WhatsApp and send message to Rinam: Hi"
"Hey Paras, open Chrome and search Google"
"Hey Paras, call mom"
"Hey Paras, open Spotify and play my playlist"
```

### Chat Interface

1. Type messages directly in the input field
2. Use the microphone button to activate voice commands
3. Press Enter or click Send to execute
4. View task status in real-time
5. Access history and settings from the header

## 🔐 Safety & Boundaries

- System file protection
- Personal data security
- Rate limiting
- Permission-based execution
- Error handling and logging

## 🎨 Customization

### Theme Colors

Edit `src/styles/theme.css` to customize colors:

```css
--cream-100: #fff8f3;
--coffee-dark: #6b4423;
--accent-gold: #d4a574;
```

### Activation Keyword

Change the voice activation keyword in `src/core/voice-handler.ts`:

```typescript
setActivationKeyword('hey assistant') // or your custom keyword
```

## 🚢 Deployment

### Desktop (Electron)

```bash
npm run electron-dev      # Development
npm run electron-build    # Production build
```

### Mobile (Capacitor)

```bash
npm run build
npx cap add android
npx cap open android
```

## 📚 Documentation

See [PROJECT_PLAN.md](./PROJECT_PLAN.md) for comprehensive project documentation, architecture details, and implementation roadmap.

## 🤝 Integration with Paxion

This project reuses and extends features from the Paxion project:
- Agent creation and management
- Boundary constraints
- Task execution framework
- API integration patterns

## 📄 License

Part of the Antigravity suite.

---

**Version**: 0.1.0  
**Status**: In Development

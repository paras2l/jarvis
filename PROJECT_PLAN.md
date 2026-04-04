# Test Model - Personal AI Agent Application

## 🎯 Project Overview
A personal AI agent application that acts as an autonomous assistant capable of controlling your desktop/mobile device, executing tasks, making calls, and responding to voice commands. Built with a cafe-themed aesthetic featuring cream and coffee color schemes.

---

## 🎨 UI/UX Design

### Theme & Aesthetics
- **Primary Colors**: Cream (#FFF8F3), Coffee Brown (#6B4423), Dark Coffee (#3D2817)
- **Accent Colors**: Warm Gold (#D4A574), Soft White (#FAF7F2)
- **Dark Mode**: Charcoal (#1A1A1A), Light Gray (#2D2D2D)
- **Overall Vibe**: Cafe/Coffee Shop aesthetic

### Core Pages
1. **Chat Page** (Main)
   - Message history display
   - Input field with voice activation button
   - Agent status indicator
   - Connect Agent button
   - Dark mode toggle
   - Settings access

2. **History Page**
   - Chat history browsing
   - Task history
   - Call history
   - Search functionality

3. **Settings Page**
   - Voice settings (activation keyword, sensitivity)
   - Connected APIs/Agents management
   - Device control permissions
   - Notification preferences
   - Theme settings
   - Privacy & boundaries

4. **Connect Agent Page**
   - Add new agents
   - API integration form
   - Multi-API connection setup
   - Agent configuration

---

## 🧠 Core Features

### 1. Chat Interface
- Single-page reactive chat application
- Real-time message handling
- Task display and status tracking
- Dark/Light mode toggle

### 2. Voice Activation System
- "Hey [AppName]" activation (always listening when enabled)
- Continuous voice command mode
- Auto-pause on task completion
- "Anything else?" follow-up prompt
- Mic doesn't need to be touched once activated

### 3. Task Automation & Execution
- Execute desktop applications
- Execute mobile applications
- OpenApp & SendMessage pattern
  - Example: "Open WhatsApp and send message to Rinam: Hi"
  - Example: "Open Chrome and search Google"
- Make phone calls
- Control screen interactions
- Background execution capability
- Real-time execution display

### 4. Multi-Agent System
- Create sub-agents (from Paxion)
- Agent boundaries and limitations
- Multiple API integration per agent
- Agent-specific task handling
- Agent status monitoring

### 5. API Integration
Knowledge-based responses using:
- Multiple API support
- Query-based API selection
- Knowledge vs Task differentiation

### 6. Device Control
- Screen control (mobile/desktop)
- App launching
- System commands execution
- Task automation
- Call initiation

---

## 🛠 Technical Stack

### Frontend
- **Framework**: React + TypeScript
- **Build**: Vite
- **State Management**: React Context / Redux
- **Voice API**: Web Speech API / Native mobile APIs
- **Styling**: CSS-in-JS / Tailwind CSS

### Backend/Core
- **Voice Service**: Speech-to-text engine
- **Task Execution**: Platform-specific handlers (Windows, macOS, Android, iOS)
- **Agent Management**: Agent orchestration logic
- **API Gateway**: Multi-API coordination
- **Database**: LocalStorage / IndexedDB for history

### Mobile/Desktop
- **Electron** (Desktop - Windows, macOS)
- **React Native / Capacitor** (Mobile - Android, iOS)
- **Accessibility**: Always-listening voice feature

---

## 📂 Project Structure

```
test-model/
├── src/
│   ├── components/
│   │   ├── ChatInterface.tsx
│   │   ├── VoiceButton.tsx
│   │   ├── ConnectAgent.tsx
│   │   ├── SettingsPanel.tsx
│   │   ├── MessageBubble.tsx
│   │   ├── TaskDisplay.tsx
│   │   └── ThemeToggle.tsx
│   ├── pages/
│   │   ├── ChatPage.tsx
│   │   ├── HistoryPage.tsx
│   │   ├── SettingsPage.tsx
│   │   └── ConnectAgentPage.tsx
│   ├── core/
│   │   ├── agent-engine.ts (Sub-agent creation & management)
│   │   ├── task-executor.ts (Command execution)
│   │   ├── voice-handler.ts (Voice activation & processing)
│   │   ├── api-gateway.ts (Multi-API coordination)
│   │   └── boundaries.ts (Safety & limitations)
│   ├── utils/
│   │   ├── message-parser.ts
│   │   ├── device-controller.ts
│   │   ├── app-launcher.ts
│   │   └── api-manager.ts
│   ├── styles/
│   │   ├── theme.css
│   │   ├── chat.css
│   │   └── globals.css
│   ├── App.tsx
│   ├── main.tsx
│   └── types.ts
├── electron/
│   ├── main.ts
│   └── preload.ts
├── android/
│   └── (Android-specific code)
├── package.json
├── tsconfig.json
├── vite.config.ts
├── PROJECT_PLAN.md
└── README.md
```

---

## 🔄 Workflow

### User Interaction Flow
1. User says "Hey [AppName]"
2. App wakes up and responds "Hey Paras"
3. User gives voice command
4. App processes command
5. App executes task (app launch, message send, call, etc.)
6. On task completion: "Task complete. Anything else?"
7. User continues with voice or says "No"
8. Loop repeats or voice mode ends

### Task Execution Flow
Command → Parse → Extract Intent → Create Sub-Agent → Execute → Monitor → Report Status

---

## 🔐 Boundaries & Safety (from Paxion)
- App permission limitations
- User-defined task boundaries
- Safe execution sandboxing
- Error handling & rollback
- Task logging & audit trail

---

## 🚀 Implementation Phases

### Phase 1: Foundation
- [x] Setup Vite + React + TypeScript
- [x] Create cafe-themed UI components
- [x] Implement basic chat interface
- [x] Dark mode toggle

### Phase 2: Core Features
- [x] Voice activation system
- [x] Message parsing engine
- [x] Basic task execution
- [x] Agent management (from Paxion)

### Phase 3: Advanced Features
- [x] Multi-API integration
- [x] Device control
- [x] Call capabilities
- [x] Advanced task automation
- [x] Cross-device orchestration (Phase 3 - NEW)
  - Device mesh discovery and registry
  - Inter-device communication bridge
  - Wake protocols (Bluetooth, WiFi, Push, HTTP)
  - Device-targeted task routing
  - Cross-device permission management

### Phase 4: Polish
- [x] History management
- [x] Settings panel
- [x] Error handling
- [x] Performance optimization

### Phase 5: Deployment
- [ ] Electron packaging
- [ ] Mobile builds (Android/iOS)
- [ ] Release pipeline

---

## 📝 Notes
- Reuse components and architecture from `the-paxion` project as foundation
- Leverage existing agent creation logic and boundaries system
- Voice feature should work even when app is minimized
- All commands should be logged to history for audit trail
- Phase 1 and Phase 2 are implemented in the current workspace, including theme switching, voice activation, task parsing/execution, and agent engine integration.
- Phase 4 is implemented with persistent chat history, a resettable settings panel, visible runtime errors, and debounced history writes.
- Phase 3 is now implemented with:
  - **Device Mesh (`src/core/device-mesh.ts`)**: Device discovery, registration, status tracking, and permission management. Maintains a local registry of all devices with heartbeat mechanism.
  - **Device Bridge (`src/core/device-bridge.ts`)**: Inter-device communication, task relay with message logging, response aggregation, and a device-aware task wrapper (RemoteTask).
  - **Wakeup Manager (`src/core/device-wakeup.ts`)**: Multi-protocol wake support including Bluetooth Low Energy (BLE), WiFi Wake-on-LAN (WoL), push notifications, and HTTP requests.
  - **Agent Engine Extension**: Added `executeRemoteTask()`, `executeLocalTask()`, `routeAndExecuteTask()`, and `getAvailableDevices()` to support cross-device orchestration with boundary validation.
  - **Type System Updates**: New types for Device, DeviceMessage, RemoteTask, DevicePermission, and WakeProtocol enable type-safe device operations.
  - **Behavior**: Voice commands can now target specific devices (e.g., "Open Spotify on my phone") with automatic device wakeup, permission checking, and response relay back to the user.

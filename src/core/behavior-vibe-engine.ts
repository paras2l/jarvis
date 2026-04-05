type VibeProfile = {
  key: string
  label: string
  aliases: string[]
  seedArtists: string[]
  seedGenres: string[]
}

type PlaybackIntent = {
  vibe: string
  label: string
  query: string
}

/**
 * Lightweight behavior/vibe inference adapted from The Paxion's profiling style.
 * It maps user mood language into deterministic playback intents.
 */
class BehaviorVibeEngine {
  private profiles: VibeProfile[] = [
    {
      key: 'focus',
      label: 'focus mode',
      aliases: ['focus', 'study', 'work', 'deep work', 'concentration'],
      seedArtists: ['Hans Zimmer', 'Nils Frahm'],
      seedGenres: ['instrumental', 'lofi'],
    },
    {
      key: 'chill',
      label: 'chill mode',
      aliases: ['chill', 'relax', 'calm', 'easy'],
      seedArtists: ['Khruangbin', 'FKJ'],
      seedGenres: ['chillhop', 'ambient'],
    },
    {
      key: 'hype',
      label: 'hype mode',
      aliases: ['hype', 'gym', 'energy', 'party', 'pump'],
      seedArtists: ['Travis Scott', 'Skrillex'],
      seedGenres: ['edm', 'trap'],
    },
    {
      key: 'romantic',
      label: 'romantic mode',
      aliases: ['romantic', 'love', 'date', 'soft'],
      seedArtists: ['Arijit Singh', 'The Weeknd'],
      seedGenres: ['romantic', 'rnb'],
    },
    {
      key: 'sad',
      label: 'healing mode',
      aliases: ['sad', 'low', 'down', 'heartbreak'],
      seedArtists: ['Lana Del Rey', 'Adele'],
      seedGenres: ['acoustic', 'soul'],
    },
  ]

  inferPlaybackFromCommand(command: string): PlaybackIntent {
    const lower = command.toLowerCase()
    const direct = this.extractExplicitPlaybackIntent(command)

    if (direct.query) {
      return direct
    }

    const match = this.profiles.find((profile) =>
      profile.aliases.some((alias) => lower.includes(alias))
    )

    const selected = match || this.profiles[1]
    const query = `${selected.seedGenres[0]} ${selected.seedArtists[0]}`

    return {
      vibe: selected.key,
      label: selected.label,
      query,
    }
  }

  extractExplicitPlaybackIntent(text: string): PlaybackIntent {
    const trimmed = text.trim()
    const playMatch = trimmed.match(/(?:play|put on|start)\s+(.+)$/i)
    const query = playMatch ? playMatch[1].trim() : ''

    if (query) {
      return {
        vibe: 'explicit',
        label: query,
        query,
      }
    }

    return {
      vibe: 'default',
      label: 'recommended vibe mix',
      query: '',
    }
  }
}

export const behaviorVibeEngine = new BehaviorVibeEngine()

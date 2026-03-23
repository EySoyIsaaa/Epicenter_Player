/**
 * Epicenter Hi-Fi - Apple Music Style Player
 * Diseño minimalista, monocromático y premium
 * Con biblioteca de música organizada, playlists y cola interactiva
 *
 * v1.1.3 - Splash screen + Last track memory
 */

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Plus,
  Disc3,
  ChevronRight,
  User,
  Music2,
  Folder,
  ListPlus,
  PlayCircle,
  GripVertical,
  X,
  Shuffle,
  Settings,
  Globe,
  Info,
  ChevronDown,
  Volume2,
  ListMusic,
  MoreVertical,
  Edit3,
  Trash2,
  Check,
  AlertCircle,
  FileText,
  BookOpen,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Link } from "wouter";
import {
  EQ_GAIN_MAX,
  EQ_GAIN_MIN,
  useIntegratedAudioProcessor,
  type StreamingParams,
} from "@/hooks/useIntegratedAudioProcessor";

import {
  analyzeSpectrumAndSelectPreset,
  applyPresetSmooth,
  suggestDspFromScores,
} from "@/audio/autoPresetSelector";
import { useAudioQueue, type Track } from "@/hooks/useAudioQueue";
import { usePlaylists, type Playlist } from "@/hooks/usePlaylists";
import { usePresetPersistence } from "@/hooks/usePresetPersistence";
import { useMediaSession } from "@/hooks/useMediaSession";
import { useMediaNotification } from "@/hooks/useMediaNotification";
import { useNotificationPermission } from "@/hooks/useNotificationPermission";
import { useCrossfade } from "@/hooks/useCrossfade";
import { useLastTrack } from "@/hooks/useLastTrack";
import { useTheme } from "@/contexts/ThemeContext";
import { KnobControl } from "@/components/KnobControl";
import { AudioQualityBadge } from "@/components/AudioQualityBadge";

import { EQVisualizer } from "@/components/EQVisualizer";
import { SwipeableTrackItem } from "@/components/SwipeableTrackItem";
import { AndroidMusicImporter } from "@/components/AndroidMusicImporter";
import { MusicScanner } from "@/components/MusicScanner";
import { BottomNavigation } from "@/components/BottomNavigation";
import { TrackArtwork } from "@/components/TrackArtwork";
import {
  AddSongsToPlaylistModal,
  AddToPlaylistModal,
  DeletePlaylistModal,
  DuplicatesModal,
  OnboardingModal,
  PlaylistContextMenu,
  PlaylistNameModal,
  TrackContextMenu,
} from "@/components/home/HomeOverlays";
import { HomePlayerView } from "@/components/home/HomePlayerView";
import { useLanguage } from "@/hooks/useLanguage";
import {
  useAndroidMusicLibrary,
  type AndroidMusicFile,
} from "@/hooks/useAndroidMusicLibrary";
import { hiresAudioBadgeUrl, hiresLogoUrl } from "@/lib/assetUrls";
import { toast } from "sonner";

const clampDspParam = (key: keyof StreamingParams, value: number): number => {
  switch (key) {
    case "sweepFreq":
      return Math.max(27, Math.min(63, value));
    case "width":
    case "intensity":
    case "balance":
    case "volume":
      return Math.max(0, Math.min(100, value));
    default:
      return value;
  }
};

const clampDspParams = (params: StreamingParams): StreamingParams => ({
  sweepFreq: clampDspParam("sweepFreq", params.sweepFreq),
  width: clampDspParam("width", params.width),
  intensity: clampDspParam("intensity", params.intensity),
  balance: clampDspParam("balance", params.balance),
  volume: clampDspParam("volume", params.volume),
});

type TabType = "player" | "library" | "search" | "eq" | "dsp" | "settings";
type LibraryView =
  | "main"
  | "songs"
  | "artists"
  | "albums"
  | "hires"
  | "playlists"
  | "playlist-detail";

export default function Home() {
  const audioProcessor = useIntegratedAudioProcessor();
  const queue = useAudioQueue();
  const presetManager = usePresetPersistence();
  const mediaSession = useMediaSession();
  const mediaNotification = useMediaNotification();
  const crossfade = useCrossfade();
  const lastTrack = useLastTrack();
  const { t, language, setLanguage } = useLanguage();
  const { theme, toggleTheme, switchable } = useTheme();
  const playlistManager = usePlaylists(queue.library);
  const androidMusicLibrary = useAndroidMusicLibrary();

  // Solicitar permiso de notificaciones en Android 13+
  useNotificationPermission();

  const [activeTab, setActiveTab] = useState<TabType>("player");
  const [libraryView, setLibraryView] = useState<LibraryView>("main");
  const [songSort, setSongSort] = useState<"default" | "name" | "artist">(
    "default",
  );
  const [visibleSongsCount, setVisibleSongsCount] = useState(250);
  const [showQueue, setShowQueue] = useState(false);
  const [globalSearchQuery, setGlobalSearchQuery] = useState("");
  const [dspParams, setDspParams] = useState<StreamingParams>({
    sweepFreq: 45,
    width: 50,
    intensity: 50,
    balance: 50,
    volume: 100,
  });
  const epicenterEnabled = audioProcessor.epicenterEnabled;
  const [eqAutoEnabled, setEqAutoEnabled] = useState(false);
  const [dspAutoEnabled, setDspAutoEnabled] = useState(false);
  const [showEqAutoModal, setShowEqAutoModal] = useState(false);
  const [showDspAutoModal, setShowDspAutoModal] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    track: Track;
    x: number;
    y: number;
  } | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Playlist states
  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(
    null,
  );
  const [showCreatePlaylist, setShowCreatePlaylist] = useState(false);
  const [showRenamePlaylist, setShowRenamePlaylist] = useState(false);
  const [showDeletePlaylist, setShowDeletePlaylist] = useState(false);
  const [showAddToPlaylist, setShowAddToPlaylist] = useState<Track | null>(
    null,
  );
  const [showAddSongsToPlaylist, setShowAddSongsToPlaylist] = useState(false); // New: modal to add songs from library
  const [showDuplicatesModal, setShowDuplicatesModal] = useState<string[]>([]);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [playlistMenu, setPlaylistMenu] = useState<{
    playlist: Playlist;
    x: number;
    y: number;
  } | null>(null);

  // Ref para evitar recargar el archivo cuando cambian los params
  const currentTrackRef = useRef<string | null>(null);
  const initialLoadRef = useRef(true);
  const lastAutoPresetTrackRef = useRef<string | null>(null);
  const lastAutoPresetTimeRef = useRef(0);

  const hiResTracks = useMemo(
    () => queue.library.filter((track) => track.isHiRes),
    [queue.library],
  );

  const sortedSongs = useMemo(() => {
    if (songSort === "default") return queue.library;
    const copy = [...queue.library];
    if (songSort === "name") {
      copy.sort((a, b) =>
        a.title.localeCompare(b.title, language === "es" ? "es" : "en", {
          sensitivity: "base",
        }),
      );
      return copy;
    }
    copy.sort((a, b) =>
      a.artist.localeCompare(b.artist, language === "es" ? "es" : "en", {
        sensitivity: "base",
      }),
    );
    return copy;
  }, [queue.library, songSort, language]);

  useEffect(() => {
    setVisibleSongsCount(250);
  }, [songSort, queue.library.length]);
  const normalizedGlobalQuery = globalSearchQuery.trim().toLowerCase();

  const globalResults = useMemo(() => {
    if (!normalizedGlobalQuery) return [];
    return queue.library.filter((track) =>
      `${track.title} ${track.artist}`
        .toLowerCase()
        .includes(normalizedGlobalQuery),
    );
  }, [queue.library, normalizedGlobalQuery]);

  useEffect(() => {
    const dismissed = localStorage.getItem("epicenter-onboarding-dismissed");
    const legacyDismissed = localStorage.getItem("epicenter-welcome-dismissed");
    if (!dismissed && !legacyDismissed) {
      setShowOnboarding(true);
    } else if (!dismissed && legacyDismissed) {
      localStorage.setItem("epicenter-onboarding-dismissed", "true");
    }
  }, []);

  const onboardingSteps = useMemo(
    () => [
      {
        title: t("onboarding.step1Title"),
        description: t("onboarding.step1Description"),
      },
      {
        title: t("onboarding.step2Title"),
        description: t("onboarding.step2Description"),
      },
      {
        title: t("onboarding.step3Title"),
        description: t("onboarding.step3Description"),
      },
    ],
    [t],
  );

  const dismissOnboarding = useCallback(() => {
    localStorage.setItem("epicenter-onboarding-dismissed", "true");
    setShowOnboarding(false);
    setOnboardingStep(0);
  }, []);

  // Actualizar selectedPlaylist cuando cambien los playlists
  useEffect(() => {
    if (selectedPlaylist) {
      const updated = playlistManager.playlists.find(
        (p) => p.id === selectedPlaylist.id,
      );
      if (
        updated &&
        updated.trackIds.length !== selectedPlaylist.trackIds.length
      ) {
        setSelectedPlaylist(updated);
      }
    }
  }, [playlistManager.playlists, selectedPlaylist]);

  // Cargar última configuración
  useEffect(() => {
    const lastConfig = presetManager.getLastConfig();
    if (lastConfig) {
      setDspParams(clampDspParams(lastConfig.dspParams));
      audioProcessor.eqBands.forEach((_, index) => {
        audioProcessor.setEqBandGain(index, lastConfig.eqBands[index] || 0);
      });
    }
    initialLoadRef.current = false;
  }, []);

  // Configurar crossfade en el procesador de audio
  useEffect(() => {
    audioProcessor.setCrossfadeConfig({
      enabled: crossfade.enabled,
      duration: crossfade.duration,
    });
  }, [crossfade.enabled, crossfade.duration, audioProcessor]);

  // Configurar callback para cuando termina una canción
  useEffect(() => {
    audioProcessor.setOnTrackEnded(() => {
      if (
        queue.queue.length > 0 &&
        queue.currentTrackIndex < queue.queue.length - 1
      ) {
        queue.nextTrack();
      }
    });

    return () => {
      audioProcessor.setOnTrackEnded(null);
    };
  }, [audioProcessor, queue]);

  // Configurar handlers de Media Session y Notificaciones Nativas
  useEffect(() => {
    mediaSession.setHandlers({
      onPlay: () => audioProcessor.play(),
      onPause: () => audioProcessor.pause(),
      onNextTrack: () => queue.nextTrack(),
      onPreviousTrack: () => queue.previousTrack(),
      onSeekTo: (time) => audioProcessor.seek(time),
      onSeekBackward: (offset) => {
        audioProcessor.seek(Math.max(0, audioProcessor.currentTime - offset));
      },
      onSeekForward: (offset) => {
        audioProcessor.seek(
          Math.min(
            audioProcessor.duration,
            audioProcessor.currentTime + offset,
          ),
        );
      },
    });

    mediaNotification.setHandlers({
      onPlay: () => audioProcessor.play(),
      onPause: () => audioProcessor.pause(),
      onNext: () => queue.nextTrack(),
      onPrevious: () => queue.previousTrack(),
      onSeek: (time) => audioProcessor.seek(time),
    });
  }, [audioProcessor, queue, mediaSession, mediaNotification]);

  // Actualizar metadatos en Media Session cuando cambia el track
  useEffect(() => {
    if (queue.currentTrack) {
      mediaSession.updateMetadata({
        title: queue.currentTrack.title,
        artist: queue.currentTrack.artist,
        artwork: queue.currentTrack.coverUrl,
      });

      mediaNotification.updateMetadata({
        title: queue.currentTrack.title,
        artist: queue.currentTrack.artist,
        album: "Epicenter Hi-Fi",
        artwork: queue.currentTrack.coverUrl,
      });
    }
  }, [queue.currentTrack, mediaSession, mediaNotification]);

  // Actualizar estado de reproducción
  useEffect(() => {
    mediaSession.updatePlaybackState(
      audioProcessor.isPlaying ? "playing" : "paused",
    );
    mediaNotification.updatePlaybackState(audioProcessor.isPlaying);

    if (audioProcessor.isPlaying && queue.currentTrack) {
      mediaNotification.start();
    }
  }, [
    audioProcessor.isPlaying,
    mediaSession,
    mediaNotification,
    queue.currentTrack,
  ]);

  // Actualizar posición
  useEffect(() => {
    if (audioProcessor.duration > 0) {
      mediaSession.updatePosition(
        audioProcessor.currentTime,
        audioProcessor.duration,
      );
      mediaNotification.updatePosition(
        audioProcessor.currentTime,
        audioProcessor.duration,
      );
    }
  }, [
    audioProcessor.currentTime,
    audioProcessor.duration,
    mediaSession,
    mediaNotification,
  ]);

  // Guardar configuración (debounced)
  useEffect(() => {
    if (initialLoadRef.current) return;
    const timer = setTimeout(() => {
      presetManager.saveLastConfig(
        audioProcessor.eqBands.map((b) => b.gain),
        dspParams,
      );
    }, 500);
    return () => clearTimeout(timer);
  }, [dspParams, audioProcessor.eqBands]);

  // Cargar última canción al iniciar (sin autoplay)
  const lastTrackLoadedRef = useRef(false);
  useEffect(() => {
    const loadLastTrack = async () => {
      // Solo cargar si: biblioteca lista, lastTrack cargado, no hay canción actual, no hemos cargado ya
      if (
        !queue.isLoading &&
        lastTrack.isLoaded &&
        lastTrack.lastTrackId &&
        !queue.currentTrack &&
        !lastTrackLoadedRef.current
      ) {
        lastTrackLoadedRef.current = true;

        // Buscar el track en la biblioteca
        const track = queue.library.find((t) => t.id === lastTrack.lastTrackId);
        if (track) {
          console.log("[LastTrack] Loading last track:", track.title);
          // Agregar a la cola sin reproducir
          queue.addToQueue(track);
          // Seleccionar el track (index 0)
          queue.playTrack(0);
          // Cargar el archivo pero NO reproducir automáticamente
          try {
            const source = track.sourceUri ?? track.file;
            if (!source) {
              throw new Error("Track source not available");
            }
            await audioProcessor.loadFile(source, dspParams);
            // NO llamar audioProcessor.play() - el usuario debe iniciar manualmente
            currentTrackRef.current = track.id;
          } catch (error) {
            console.error("[LastTrack] Error loading last track:", error);
          }
        }
      }
    };
    loadLastTrack();
  }, [
    queue.isLoading,
    lastTrack.isLoaded,
    lastTrack.lastTrackId,
    queue.library,
  ]);

  // Cargar track cuando cambia (y guardar como último track)
  useEffect(() => {
    const loadTrack = async () => {
      if (
        queue.currentTrack &&
        queue.currentTrack.id !== currentTrackRef.current
      ) {
        currentTrackRef.current = queue.currentTrack.id;

        // Guardar como última canción reproducida (usando el ID original, no el de cola)
        const originalId = queue.currentTrack.id.replace(/^queue-\d+-\w+$/, "");
        // Buscar el ID real en la biblioteca
        const libraryTrack = queue.library.find(
          (t) =>
            queue.currentTrack?.title === t.title &&
            queue.currentTrack?.artist === t.artist,
        );
        if (libraryTrack) {
          lastTrack.saveLastTrack(libraryTrack.id);
        }

        try {
          let source: File | string | undefined;

          // Si es un track de MediaStore, obtener URL del archivo en caché
          if (
            queue.currentTrack.sourceType === "media-store" &&
            queue.currentTrack.sourceUri
          ) {
            console.log("🎵 Track de MediaStore, obteniendo URL de archivo...");
            const trackId = queue.currentTrack.id.replace("media-", "");
            const fileUrl = await androidMusicLibrary.getAudioFileUrl(
              queue.currentTrack.sourceUri,
              trackId,
            );
            if (fileUrl) {
              source = fileUrl;
              console.log("✅ URL de archivo obtenida para reproducción");
            } else {
              throw new Error("No se pudo obtener el audio del dispositivo");
            }
          } else {
            // Track importado manualmente
            source = await queue.getTrackFile(queue.currentTrack);
          }

          if (!source) {
            throw new Error("Track source not available");
          }
          await audioProcessor.loadFile(source, dspParams);
          setTimeout(() => {
            audioProcessor.play();
            setTimeout(() => {
              runAutoOptimization();
            }, 1400);
          }, 100);
        } catch (error) {
          console.error("Error loading track:", error);
          toast.error(t("actions.errorLoadingTrack"));
        }
      }
    };
    loadTrack();
  }, [queue.currentTrack?.id]);

  const handleFileSelect = useCallback(async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "audio/*,.mp3,.wav,.flac,.ogg,.m4a,.aac";
    input.multiple = true;
    input.onchange = async (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || []);
      if (files.length > 0) {
        try {
          const result = await queue.addToLibrary(files);

          // Show success message for added songs
          if (result.added > 0) {
            const msg =
              result.added > 1
                ? t("actions.songsAddedPlural", { count: result.added })
                : t("actions.songsAdded", { count: result.added });
            toast.success(msg);
          }

          // Show duplicates modal if any
          if (result.duplicates.length > 0) {
            setShowDuplicatesModal(result.duplicates);
          }
        } catch (error) {
          toast.error(t("actions.errorAddingSongs"));
        }
      }
    };
    input.click();
  }, [queue, t]);

  const handleMediaStoreImport = useCallback(
    async (tracks: AndroidMusicFile[]) => {
      const result = await queue.addMediaStoreTracks(
        tracks,
        androidMusicLibrary.getAlbumArt,
      );

      if (result.added > 0) {
        const msg =
          result.added > 1
            ? t("actions.songsAddedPlural", { count: result.added })
            : t("actions.songsAdded", { count: result.added });
        toast.success(msg);
      }

      if (result.duplicates.length > 0) {
        setShowDuplicatesModal(result.duplicates);
      }

      return result;
    },
    [queue, t],
  );

  const updateDspParam = useCallback(
    (key: keyof StreamingParams, value: number) => {
      const clampedValue = clampDspParam(key, value);
      setDspParams((prev) => ({ ...prev, [key]: clampedValue }));
      if (key === "volume" || epicenterEnabled) {
        audioProcessor.setDspParam(key, clampedValue);
      }
    },
    [audioProcessor, epicenterEnabled],
  );

  const toggleEq = useCallback(
    (enabled: boolean) => {
      audioProcessor.setEqEnabled(enabled);

      // Epicenter debe poder seguir activo de forma independiente aunque el EQ se apague.
    },
    [audioProcessor, epicenterEnabled],
  );

  const toggleEpicenter = useCallback(() => {
    const newEnabled = !epicenterEnabled;
    audioProcessor.setEpicenterEnabled(newEnabled);
    if (newEnabled) {
      Object.entries(dspParams).forEach(([key, value]) => {
        audioProcessor.setDspParam(key as keyof StreamingParams, value);
      });
    }
  }, [epicenterEnabled, audioProcessor, dspParams]);

  async function runAutoOptimization(force = false) {
    if (!eqAutoEnabled && !dspAutoEnabled) return;
    if (!queue.currentTrack) return;

    const now = Date.now();
    if (
      !force &&
      lastAutoPresetTrackRef.current === queue.currentTrack.id &&
      now - lastAutoPresetTimeRef.current < 30000
    ) {
      return;
    }

    const analyserNode = audioProcessor.getAnalyserNode();
    const selection = await analyzeSpectrumAndSelectPreset({
      analyserNode,
      sampleCount: 80,
      intervalMs: 125,
    });

    if (eqAutoEnabled) {
      const currentGains = audioProcessor.eqBands.map((band) => band.gain);
      await applyPresetSmooth({
        currentGains,
        targetGains: selection.preset.gainsDb,
        setEqBandGain: audioProcessor.setEqBandGain,
        durationMs: 800,
        stepMs: 100,
        maxDeltaPerStep: 0.5,
      });
      audioProcessor.setEqPreampDb(selection.preset.preampDb);
      audioProcessor.setEqEnabled(true);
    }

    if (dspAutoEnabled) {
      if (!epicenterEnabled) {
        audioProcessor.setEpicenterEnabled(true);
      }
      const dspSuggestion = suggestDspFromScores(selection.debug);
      const clampedSuggestion = clampDspParams({
        ...dspParams,
        ...dspSuggestion,
      });
      setDspParams(clampedSuggestion);
      Object.entries(clampedSuggestion).forEach(([key, value]) => {
        if (typeof value === "number") {
          audioProcessor.setDspParam(key as keyof StreamingParams, value);
        }
      });
    }

    lastAutoPresetTrackRef.current = queue.currentTrack.id;
    lastAutoPresetTimeRef.current = now;

    console.log("[AutoAdjustment]", {
      presetId: selection.presetId,
      presetName: selection.preset.name,
      debug: selection.debug,
    });

    toast.success(t("actions.autoOptimizedPreset"));
  }

  const formatTime = (seconds: number) => {
    if (!isFinite(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // Agrupar canciones
  const songsByArtist = useMemo(
    () =>
      queue.library.reduce(
        (acc, track) => {
          const artist = track.artist || t("common.unknownArtist");
          if (!acc[artist]) acc[artist] = [];
          acc[artist].push(track);
          return acc;
        },
        {} as Record<string, Track[]>,
      ),
    [queue.library, t],
  );

  const albums = useMemo(
    () =>
      queue.library.reduce(
        (acc, track) => {
          const album = track.title.split(" - ")[0] || track.title;
          if (!acc[album]) acc[album] = [];
          acc[album].push(track);
          return acc;
        },
        {} as Record<string, Track[]>,
      ),
    [queue.library],
  );

  // Handlers
  const handleAddToQueue = (track: Track) => {
    queue.addToQueue(track);
    toast.success(t("actions.addedToQueue"));
    setContextMenu(null);
  };

  const handlePlayNext = (track: Track) => {
    queue.addToQueueNext(track);
    toast.success(t("actions.willPlayNext"));
    setContextMenu(null);
  };

  const handlePlayNow = (track: Track) => {
    queue.playNow(track);
    setContextMenu(null);
    setActiveTab("player");
    setShowQueue(false);
  };

  const handleShufflePlay = (tracks: Track[]) => {
    if (tracks.length === 0) {
      toast.error(t("actions.noSongsToPlay"));
      return;
    }
    queue.shuffleAll(tracks);
    toast.success(t("actions.playingShuffled", { count: tracks.length }));
    setActiveTab("player");
    setShowQueue(false);
  };

  const handlePlayInOrder = (tracks: Track[]) => {
    if (tracks.length === 0) {
      toast.error(t("actions.noSongsToPlay"));
      return;
    }
    queue.playAllInOrder(tracks);
    toast.success(t("actions.playingAll", { count: tracks.length }));
    setActiveTab("player");
    setShowQueue(false);
  };

  // Playlist handlers
  const handleCreatePlaylist = async () => {
    if (!newPlaylistName.trim()) return;
    await playlistManager.createPlaylist(newPlaylistName.trim());
    toast.success(t("playlists.created"));
    setNewPlaylistName("");
    setShowCreatePlaylist(false);
  };

  const handleRenamePlaylist = async () => {
    if (!selectedPlaylist || !newPlaylistName.trim()) return;
    await playlistManager.renamePlaylist(
      selectedPlaylist.id,
      newPlaylistName.trim(),
    );
    setSelectedPlaylist({ ...selectedPlaylist, name: newPlaylistName.trim() });
    toast.success(t("playlists.renamed"));
    setNewPlaylistName("");
    setShowRenamePlaylist(false);
    setPlaylistMenu(null);
  };

  const handleDeletePlaylist = async () => {
    if (!selectedPlaylist) return;
    await playlistManager.deletePlaylist(selectedPlaylist.id);
    toast.success(t("playlists.deleted"));
    setSelectedPlaylist(null);
    setShowDeletePlaylist(false);
    setPlaylistMenu(null);
    setLibraryView("playlists");
  };

  const handleAddToPlaylist = async (playlistId: string, track: Track) => {
    await playlistManager.addTrackToPlaylist(playlistId, track.id);
    toast.success(t("playlists.songAdded"));
    setShowAddToPlaylist(null);
  };

  const handleRemoveFromPlaylist = async (track: Track) => {
    if (!selectedPlaylist) return;
    await playlistManager.removeTrackFromPlaylist(
      selectedPlaylist.id,
      track.id,
    );
    // Update local state
    const updatedPlaylist = playlistManager.playlists.find(
      (p) => p.id === selectedPlaylist.id,
    );
    if (updatedPlaylist) {
      setSelectedPlaylist(updatedPlaylist);
    }
    toast.success(t("playlists.songRemoved"));
  };

  // Handler para abrir modal de selección de playlist desde cualquier canción
  const handleOpenAddToPlaylist = (track: Track) => {
    setShowAddToPlaylist(track);
  };

  // Handler para agregar canción a la playlist seleccionada (desde el modal dentro de playlist-detail)
  const handleAddSongToSelectedPlaylist = async (track: Track) => {
    if (!selectedPlaylist) return;

    // Check if already in playlist
    if (selectedPlaylist.trackIds.includes(track.id)) {
      toast.error(t("duplicates.alreadyInPlaylist"));
      return;
    }

    await playlistManager.addTrackToPlaylist(selectedPlaylist.id, track.id);
    toast.success(t("playlists.songAdded"));
  };

  // Touch reorder state
  const [touchStart, setTouchStart] = useState<{
    index: number;
    y: number;
  } | null>(null);

  return (
    <div className="min-h-screen flex flex-col bg-black text-white">
      <TrackContextMenu
        contextMenu={contextMenu}
        t={t}
        onClose={() => setContextMenu(null)}
        onPlayNow={handlePlayNow}
        onPlayNext={handlePlayNext}
        onAddToQueue={handleAddToQueue}
        onAddToPlaylist={(track) => {
          setShowAddToPlaylist(track);
          setContextMenu(null);
        }}
      />

      <PlaylistContextMenu
        playlistMenu={playlistMenu}
        t={t}
        onClose={() => setPlaylistMenu(null)}
        onRename={(playlist) => {
          setSelectedPlaylist(playlist);
          setNewPlaylistName(playlist.name);
          setShowRenamePlaylist(true);
        }}
        onDelete={(playlist) => {
          setSelectedPlaylist(playlist);
          setShowDeletePlaylist(true);
        }}
      />

      <PlaylistNameModal
        isOpen={showCreatePlaylist}
        title={t("playlists.createNew")}
        confirmLabel={t("playlists.create")}
        cancelLabel={t("common.cancel")}
        playlistName={newPlaylistName}
        placeholder={t("playlists.enterName")}
        onPlaylistNameChange={setNewPlaylistName}
        onClose={() => {
          setShowCreatePlaylist(false);
          setNewPlaylistName("");
        }}
        onConfirm={handleCreatePlaylist}
      />

      <PlaylistNameModal
        isOpen={showRenamePlaylist && !!selectedPlaylist}
        title={t("playlists.rename")}
        confirmLabel={t("common.save")}
        cancelLabel={t("common.cancel")}
        playlistName={newPlaylistName}
        placeholder={t("playlists.enterName")}
        onPlaylistNameChange={setNewPlaylistName}
        onClose={() => {
          setShowRenamePlaylist(false);
          setNewPlaylistName("");
          setPlaylistMenu(null);
        }}
        onConfirm={handleRenamePlaylist}
      />

      <DeletePlaylistModal
        isOpen={showDeletePlaylist && !!selectedPlaylist}
        t={t}
        onClose={() => {
          setShowDeletePlaylist(false);
          setPlaylistMenu(null);
        }}
        onConfirm={handleDeletePlaylist}
      />

      <AddToPlaylistModal
        track={showAddToPlaylist}
        playlists={playlistManager.playlists}
        t={t}
        onClose={() => setShowAddToPlaylist(null)}
        onSelect={handleAddToPlaylist}
      />

      <DuplicatesModal
        duplicateFileNames={showDuplicatesModal}
        t={t}
        onClose={() => setShowDuplicatesModal([])}
      />

      <OnboardingModal
        isOpen={showOnboarding}
        t={t}
        steps={onboardingSteps}
        currentStep={onboardingStep}
        onClose={dismissOnboarding}
        onPrevious={() => setOnboardingStep((prev) => Math.max(prev - 1, 0))}
        onNext={() =>
          setOnboardingStep((prev) =>
            Math.min(prev + 1, onboardingSteps.length - 1),
          )
        }
      />

      <AddSongsToPlaylistModal
        isOpen={showAddSongsToPlaylist}
        selectedPlaylist={selectedPlaylist}
        library={queue.library}
        t={t}
        onClose={() => setShowAddSongsToPlaylist(false)}
        onAddTrack={handleAddSongToSelectedPlaylist}
      />

      <HomePlayerView
        isVisible={activeTab === "player"}
        t={t}
        showQueue={showQueue}
        onToggleQueue={() => setShowQueue(!showQueue)}
        onCloseQueue={() => setShowQueue(false)}
        onOpenFilePicker={handleFileSelect}
        queue={{
          queue: queue.queue,
          currentTrack: queue.currentTrack,
          currentTrackIndex: queue.currentTrackIndex,
          playTrack: queue.playTrack,
          removeFromQueue: queue.removeFromQueue,
          reorderQueue: queue.reorderQueue,
          previousTrack: queue.previousTrack,
          nextTrack: queue.nextTrack,
        }}
        audioProcessor={{
          currentTime: audioProcessor.currentTime,
          duration: audioProcessor.duration,
          isPlaying: audioProcessor.isPlaying,
          seek: audioProcessor.seek,
          pause: audioProcessor.pause,
          play: audioProcessor.play,
        }}
        draggedIndex={draggedIndex}
        onDraggedIndexChange={setDraggedIndex}
        touchStart={touchStart}
        onTouchStartChange={setTouchStart}
        formatTime={formatTime}
        hiresAudioBadgeUrl={hiresAudioBadgeUrl}
      />

      {/* Library View */}
      {activeTab === "library" && (
        <div className="flex-1 flex flex-col" data-testid="library-view">
          <header className="flex items-center justify-between px-6 pt-12 pb-4 border-b border-zinc-900">
            {libraryView === "main" ? (
              <h2 className="text-xl font-bold">{t("library.title")}</h2>
            ) : libraryView === "playlist-detail" && selectedPlaylist ? (
              <button
                onClick={() => {
                  setLibraryView("playlists");
                  setSelectedPlaylist(null);
                }}
                className="flex items-center gap-2 text-zinc-400 hover:text-white"
              >
                <ChevronRight className="w-5 h-5 rotate-180" />
                <span className="text-xl font-bold text-white">
                  {selectedPlaylist.name}
                </span>
              </button>
            ) : (
              <button
                onClick={() => setLibraryView("main")}
                className="flex items-center gap-2 text-zinc-400 hover:text-white"
              >
                <ChevronRight className="w-5 h-5 rotate-180" />
                <span className="text-xl font-bold text-white">
                  {libraryView === "songs"
                    ? t("library.songs")
                    : libraryView === "artists"
                      ? t("library.artists")
                      : libraryView === "albums"
                        ? t("library.albums")
                        : libraryView === "hires"
                          ? t("library.highResolution")
                          : t("library.playlists")}
                </span>
              </button>
            )}
            <div className="flex items-center gap-2">
              {libraryView === "playlists" && (
                <button
                  onClick={() => setShowCreatePlaylist(true)}
                  className="p-2 text-zinc-400 hover:text-white"
                >
                  <Plus className="w-5 h-5" />
                </button>
              )}
              {libraryView === "main" && (
                <>
                  <AndroidMusicImporter
                    onImportTracks={handleMediaStoreImport}
                  />
                  <button
                    onClick={handleFileSelect}
                    className="p-2 text-zinc-400 hover:text-white"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </>
              )}
            </div>
          </header>
          <ScrollArea className="flex-1">
            {libraryView === "main" && (
              <div className="p-4 space-y-2">
                {queue.library.length > 0 && (
                  <button
                    onClick={() => handleShufflePlay(queue.library)}
                    className="w-full flex items-center gap-4 p-4 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 transition-all mb-4"
                  >
                    <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                      <Shuffle className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="font-semibold text-white">
                        {t("library.shufflePlay")}
                      </p>
                      <p className="text-sm text-white/70">
                        {t("library.songsCount", {
                          count: queue.library.length,
                        })}
                      </p>
                    </div>
                    <Play className="w-6 h-6 text-white" fill="currentColor" />
                  </button>
                )}

                <button
                  onClick={() => setLibraryView("playlists")}
                  className="w-full flex items-center gap-4 p-4 rounded-xl bg-zinc-900/50 hover:bg-zinc-900 transition-colors"
                >
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
                    <ListMusic className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-semibold">{t("library.playlists")}</p>
                    <p className="text-sm text-zinc-500">
                      {t("library.playlistsCount", {
                        count: playlistManager.playlists.length,
                      })}
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-zinc-600" />
                </button>

                <button
                  onClick={() => setLibraryView("songs")}
                  className="w-full flex items-center gap-4 p-4 rounded-xl bg-zinc-900/50 hover:bg-zinc-900 transition-colors"
                >
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500 to-orange-500 flex items-center justify-center">
                    <Music2 className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-semibold">{t("library.songs")}</p>
                    <p className="text-sm text-zinc-500">
                      {t("library.songsCount", { count: queue.library.length })}
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-zinc-600" />
                </button>

                <button
                  onClick={() => setLibraryView("artists")}
                  className="w-full flex items-center gap-4 p-4 rounded-xl bg-zinc-900/50 hover:bg-zinc-900 transition-colors"
                >
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
                    <User className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-semibold">{t("library.artists")}</p>
                    <p className="text-sm text-zinc-500">
                      {t("library.artistsCount", {
                        count: Object.keys(songsByArtist).length,
                      })}
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-zinc-600" />
                </button>

                <button
                  onClick={() => setLibraryView("albums")}
                  className="w-full flex items-center gap-4 p-4 rounded-xl bg-zinc-900/50 hover:bg-zinc-900 transition-colors"
                >
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-teal-500 flex items-center justify-center">
                    <Folder className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-semibold">{t("library.albums")}</p>
                    <p className="text-sm text-zinc-500">
                      {t("library.albumsCount", {
                        count: Object.keys(albums).length,
                      })}
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-zinc-600" />
                </button>

                <button
                  onClick={() => setLibraryView("hires")}
                  className="w-full flex items-center gap-4 p-4 rounded-xl bg-zinc-900/50 hover:bg-zinc-900 transition-colors"
                >
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-yellow-500 flex items-center justify-center">
                    <img
                      src={hiresLogoUrl}
                      alt="Hi-Res Audio"
                      className="w-7 h-7 object-contain"
                    />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-semibold">
                      {t("library.highResolution")}
                    </p>
                    <p className="text-sm text-zinc-500">
                      {t("library.songsCount", { count: hiResTracks.length })}
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-zinc-600" />
                </button>

                {queue.isLoading ? (
                  <div className="text-center py-12">
                    <div className="w-8 h-8 border-2 border-zinc-700 border-t-white rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-zinc-500">
                      {t("library.loadingLibrary")}
                    </p>
                  </div>
                ) : queue.library.length === 0 ? (
                  <div className="text-center py-8 px-4">
                    <Disc3
                      className="w-16 h-16 text-zinc-800 mx-auto mb-4"
                      strokeWidth={1}
                    />
                    <p className="text-zinc-500 mb-6">{t("library.noMusic")}</p>

                    {/* Nuevo componente profesional de escaneo */}
                    <div className="max-w-md mx-auto">
                      <MusicScanner
                        onScanComplete={handleMediaStoreImport}
                        onManualImport={handleFileSelect}
                        isScanning={queue.importProgress.isImporting}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {libraryView === "playlists" && (
              <div className="p-4 space-y-2">
                {playlistManager.playlists.length === 0 ? (
                  <div className="text-center py-12">
                    <ListMusic
                      className="w-16 h-16 text-zinc-800 mx-auto mb-4"
                      strokeWidth={1}
                    />
                    <p className="text-zinc-500 mb-4">
                      {t("playlists.noPlaylists")}
                    </p>
                    <Button
                      onClick={() => setShowCreatePlaylist(true)}
                      variant="outline"
                      className="border-zinc-800"
                    >
                      {t("playlists.createFirst")}
                    </Button>
                  </div>
                ) : (
                  playlistManager.playlists.map((playlist) => (
                    <div
                      key={playlist.id}
                      className="flex items-center gap-4 p-4 rounded-xl bg-zinc-900/50 hover:bg-zinc-900 transition-colors"
                    >
                      <div
                        className="flex-1 flex items-center gap-4 cursor-pointer"
                        onClick={() => {
                          setSelectedPlaylist(playlist);
                          setLibraryView("playlist-detail");
                        }}
                      >
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center overflow-hidden">
                          <TrackArtwork
                            src={playlist.tracks[0]?.coverUrl}
                            alt={playlist.name}
                            iconClassName="w-6 h-6 text-zinc-300"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold truncate">
                            {playlist.name}
                          </p>
                          <p className="text-sm text-zinc-500">
                            {t("library.songsCount", {
                              count: playlist.trackIds.length,
                            })}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePlayInOrder(playlist.tracks);
                          }}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white text-black text-xs font-semibold"
                        >
                          <Play className="w-3.5 h-3.5" fill="currentColor" />
                          {t("actions.play")}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleShufflePlay(playlist.tracks);
                          }}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-zinc-700 text-xs text-white"
                        >
                          <Shuffle className="w-3.5 h-3.5" />
                          {t("library.shuffle")}
                        </button>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const rect = (
                            e.target as HTMLElement
                          ).getBoundingClientRect();
                          setPlaylistMenu({
                            playlist,
                            x: rect.left - 100,
                            y: rect.bottom + 8,
                          });
                        }}
                        className="p-2 text-zinc-500 hover:text-white"
                      >
                        <MoreVertical className="w-5 h-5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}

            {libraryView === "playlist-detail" && selectedPlaylist && (
              <div className="p-4 space-y-1">
                {/* Big Add Songs Button */}
                <button
                  onClick={() => setShowAddSongsToPlaylist(true)}
                  className="w-full flex items-center gap-4 p-4 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 border-2 border-dashed border-zinc-700 transition-all mb-4"
                >
                  <div className="w-12 h-12 rounded-xl bg-zinc-700 flex items-center justify-center">
                    <Plus className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="font-semibold text-white">
                      {t("playlists.addSongs")}
                    </p>
                    <p className="text-sm text-zinc-500">
                      {t("playlists.emptyDescription")}
                    </p>
                  </div>
                </button>

                {selectedPlaylist.tracks.length > 0 && (
                  <div className="flex flex-wrap items-center gap-3 mb-4">
                    <button
                      onClick={() => handlePlayInOrder(selectedPlaylist.tracks)}
                      className="flex items-center gap-2 px-5 py-2 rounded-full bg-white text-black font-semibold shadow-sm"
                    >
                      <Play className="w-4 h-4" fill="currentColor" />
                      {t("actions.play")}
                    </button>
                    <button
                      onClick={() => handleShufflePlay(selectedPlaylist.tracks)}
                      className="flex items-center gap-2 px-5 py-2 rounded-full border border-zinc-700 text-white"
                    >
                      <Shuffle className="w-4 h-4" />
                      {t("library.shuffle")}
                    </button>
                  </div>
                )}

                {selectedPlaylist.tracks.length === 0 ? (
                  <div className="text-center py-8">
                    <ListMusic
                      className="w-16 h-16 text-zinc-800 mx-auto mb-4"
                      strokeWidth={1}
                    />
                    <p className="text-zinc-500 mb-2">{t("playlists.empty")}</p>
                  </div>
                ) : (
                  selectedPlaylist.tracks.map((track) => (
                    <div
                      key={track.id}
                      className="flex items-center gap-3 p-3 rounded-xl hover:bg-zinc-900/50 transition-colors"
                    >
                      <div
                        className="flex-1 flex items-center gap-3 min-w-0 cursor-pointer"
                        onClick={() => handlePlayNow(track)}
                      >
                        <div className="w-10 h-10 rounded-lg bg-zinc-800 overflow-hidden flex-shrink-0">
                          <TrackArtwork
                            src={track.coverUrl}
                            alt={track.title}
                            iconClassName="w-5 h-5 text-zinc-500"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {track.title}
                          </p>
                          <p className="text-xs text-zinc-500 truncate">
                            {track.artist}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveFromPlaylist(track)}
                        className="p-2 text-zinc-600 hover:text-red-400"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}

            {libraryView === "songs" && (
              <div className="p-4 space-y-1">
                {sortedSongs.length > 0 && (
                  <>
                    <div className="flex flex-wrap items-center gap-3 mb-4">
                      <button
                        onClick={() => handlePlayInOrder(sortedSongs)}
                        className="flex items-center gap-2 px-5 py-2 rounded-full bg-white text-black font-semibold shadow-sm"
                      >
                        <Play className="w-4 h-4" fill="currentColor" />
                        {t("actions.play")}
                      </button>
                      <button
                        onClick={() => handleShufflePlay(sortedSongs)}
                        className="flex items-center gap-2 px-5 py-2 rounded-full border border-zinc-700 text-white"
                      >
                        <Shuffle className="w-4 h-4" />
                        {t("library.shuffle")}
                      </button>
                    </div>
                    <div className="mb-3 flex items-center gap-2">
                      <span className="text-xs text-zinc-500">
                        {t("library.sortBy")}
                      </span>
                      <button
                        onClick={() => setSongSort("default")}
                        className={`px-3 py-1 rounded-full text-xs ${songSort === "default" ? "bg-white text-black" : "bg-zinc-900 text-zinc-400"}`}
                      >
                        {t("library.sortDefault")}
                      </button>
                      <button
                        onClick={() => setSongSort("name")}
                        className={`px-3 py-1 rounded-full text-xs ${songSort === "name" ? "bg-white text-black" : "bg-zinc-900 text-zinc-400"}`}
                      >
                        {t("library.sortName")}
                      </button>
                      <button
                        onClick={() => setSongSort("artist")}
                        className={`px-3 py-1 rounded-full text-xs ${songSort === "artist" ? "bg-white text-black" : "bg-zinc-900 text-zinc-400"}`}
                      >
                        {t("library.sortArtist")}
                      </button>
                    </div>
                  </>
                )}
                {sortedSongs.length > 0 && (
                  <p className="text-xs text-zinc-600 text-center mb-3 px-4">
                    {t("library.swipeHint")}
                  </p>
                )}
                {sortedSongs.slice(0, visibleSongsCount).map((track) => (
                  <SwipeableTrackItem
                    key={track.id}
                    track={track}
                    onPlayNow={handlePlayNow}
                    onAddToQueue={handleAddToQueue}
                    onPlayNext={handlePlayNext}
                    onAddToPlaylist={handleOpenAddToPlaylist}
                  />
                ))}
                {visibleSongsCount < sortedSongs.length && (
                  <div className="py-4 text-center">
                    <button
                      onClick={() => setVisibleSongsCount((prev) => prev + 250)}
                      className="px-4 py-2 rounded-full bg-zinc-900 text-zinc-200 text-sm"
                    >
                      {t("library.loadMoreSongs", {
                        count: Math.min(
                          250,
                          sortedSongs.length - visibleSongsCount,
                        ),
                      })}
                    </button>
                  </div>
                )}
              </div>
            )}

            {libraryView === "hires" && (
              <div className="p-4 space-y-1">
                {hiResTracks.length > 0 && (
                  <div className="flex items-center gap-3 mb-4">
                    <button
                      onClick={() => handlePlayInOrder(hiResTracks)}
                      className="flex items-center gap-2 px-5 py-2 rounded-full bg-white text-black font-semibold shadow-sm"
                    >
                      <Play className="w-4 h-4" fill="currentColor" />
                      {t("actions.play")}
                    </button>
                    <button
                      onClick={() => handleShufflePlay(hiResTracks)}
                      className="flex items-center gap-2 px-5 py-2 rounded-full border border-zinc-700 text-white"
                    >
                      <Shuffle className="w-4 h-4" />
                      {t("library.shuffle")}
                    </button>
                  </div>
                )}
                {hiResTracks.length > 0 && (
                  <p className="text-xs text-zinc-600 text-center mb-3 px-4">
                    {t("library.swipeHint")}
                  </p>
                )}
                {hiResTracks.length === 0 && (
                  <p className="text-center text-zinc-500 py-8">
                    {t("library.noMusic", {
                      defaultValue: "No tienes música aún",
                    })}
                  </p>
                )}
                {hiResTracks.map((track) => (
                  <SwipeableTrackItem
                    key={track.id}
                    track={track}
                    onPlayNow={handlePlayNow}
                    onAddToQueue={handleAddToQueue}
                    onPlayNext={handlePlayNext}
                    onAddToPlaylist={handleOpenAddToPlaylist}
                  />
                ))}
              </div>
            )}

            {libraryView === "artists" && (
              <div className="p-4 space-y-1">
                {Object.entries(songsByArtist).map(([artist, tracks]) => (
                  <div key={artist} className="mb-4">
                    <div className="flex items-center justify-between p-3">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center">
                          <User className="w-6 h-6 text-zinc-500" />
                        </div>
                        <div>
                          <p className="font-semibold">{artist}</p>
                          <p className="text-sm text-zinc-500">
                            {t("library.songsCount", { count: tracks.length })}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handlePlayInOrder(tracks)}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white text-black text-xs font-semibold"
                        >
                          <Play className="w-3.5 h-3.5" fill="currentColor" />
                          {t("actions.play")}
                        </button>
                        <button
                          onClick={() => handleShufflePlay(tracks)}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-zinc-700 text-xs text-white"
                        >
                          <Shuffle className="w-3.5 h-3.5" />
                          {t("library.shuffle")}
                        </button>
                      </div>
                    </div>
                    <div className="ml-4 border-l border-zinc-800 pl-2">
                      {tracks.map((track) => (
                        <SwipeableTrackItem
                          key={track.id}
                          track={track}
                          onPlayNow={handlePlayNow}
                          onAddToQueue={handleAddToQueue}
                          onPlayNext={handlePlayNext}
                          onAddToPlaylist={handleOpenAddToPlaylist}
                          showArtist={false}
                          compact
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {libraryView === "albums" && (
              <div className="p-4 grid grid-cols-2 gap-3">
                {Object.entries(albums).map(([album, tracks]) => (
                  <div
                    key={album}
                    className="bg-zinc-900/50 rounded-xl p-3 hover:bg-zinc-900 transition-colors"
                  >
                    <div
                      className="aspect-square rounded-lg bg-zinc-800 mb-2 overflow-hidden cursor-pointer"
                      onClick={() => handlePlayNow(tracks[0])}
                    >
                      <TrackArtwork
                        src={tracks[0].coverUrl}
                        alt={album}
                        iconClassName="w-8 h-8 text-zinc-500"
                      />
                    </div>
                    <p className="font-medium text-sm truncate">{album}</p>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-xs text-zinc-500">
                        {t("library.songsCount", { count: tracks.length })}
                      </p>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleShufflePlay(tracks);
                        }}
                        className="p-1 text-zinc-500 hover:text-white"
                        title={t("library.shuffle")}
                      >
                        <Shuffle className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      )}

      {/* Global Search View */}
      {activeTab === "search" && (
        <div className="flex-1 flex flex-col" data-testid="search-view">
          <header className="px-6 pt-12 pb-4 border-b border-zinc-900">
            <h2 className="text-xl font-bold">{t("search.globalTitle")}</h2>
            <p className="text-xs text-zinc-500 mt-1">
              {t("search.globalSubtitle")}
            </p>
          </header>
          <div className="px-6 pt-3">
            <label className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2">
              <Search className="w-4 h-4 text-zinc-500" />
              <input
                value={globalSearchQuery}
                onChange={(e) => setGlobalSearchQuery(e.target.value)}
                placeholder={t("search.globalPlaceholder")}
                className="w-full bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 outline-none"
              />
            </label>
          </div>
          <ScrollArea className="flex-1 px-4 py-3">
            {!normalizedGlobalQuery ? (
              <p className="text-center text-zinc-500 py-10 text-sm">
                {t("search.startTyping")}
              </p>
            ) : globalResults.length === 0 ? (
              <p className="text-center text-zinc-500 py-10 text-sm">
                {t("search.noResults")}
              </p>
            ) : (
              <div className="space-y-1">
                {globalResults.map((track) => (
                  <SwipeableTrackItem
                    key={track.id}
                    track={track}
                    onPlayNow={handlePlayNow}
                    onAddToQueue={handleAddToQueue}
                    onPlayNext={handlePlayNext}
                    onAddToPlaylist={handleOpenAddToPlaylist}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      )}

      {/* Equalizer View */}
      {activeTab === "eq" && (
        <div className="flex-1 flex flex-col" data-testid="eq-view">
          <header className="flex items-center justify-between px-6 pt-12 pb-4 border-b border-zinc-900">
            <h2 className="text-xl font-bold">{t("eq.title")}</h2>
            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                onClick={() => setShowEqAutoModal(true)}
                className="text-xs px-3 py-1.5 h-auto"
              >
                {t("eq.autoButton")}
              </Button>
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500 uppercase tracking-wider">
                  {audioProcessor.eqEnabled ? t("eq.on") : t("eq.off")}
                </span>
                <Switch
                  checked={audioProcessor.eqEnabled}
                  onCheckedChange={toggleEq}
                />
              </div>
            </div>
          </header>
          <div className="flex-1 px-6 py-8">
            <div className="mb-4 rounded-2xl border border-cyan-500/25 bg-gradient-to-r from-cyan-500/10 to-violet-500/10 p-3">
              <p className="text-xs font-semibold text-cyan-200">
                {t("eq.autoBannerTitle")}
              </p>
              <p className="text-[11px] text-zinc-300 mt-1">
                {t("eq.autoBannerDescription")}
              </p>
            </div>
            <p className="text-[11px] text-zinc-500 mb-3">
              {t("eq.slideHint")}
            </p>
            <EQVisualizer
              bands={audioProcessor.eqBands}
              enabled={audioProcessor.eqEnabled}
              onBandChange={audioProcessor.setEqBandGain}
              minGain={EQ_GAIN_MIN}
              maxGain={EQ_GAIN_MAX}
              horizontalControlLabel={t("eq.horizontalSlider")}
            />
          </div>
          <div className="px-6 pb-8">
            <Button
              variant="outline"
              onClick={() =>
                audioProcessor.eqBands.forEach((_, i) =>
                  audioProcessor.setEqBandGain(i, 0),
                )
              }
              className="w-full border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-900"
            >
              {t("eq.reset")}
            </Button>
          </div>
        </div>
      )}

      {/* DSP View */}
      {activeTab === "dsp" && (
        <div className="flex-1 flex flex-col" data-testid="dsp-view">
          <header className="flex items-center justify-between px-6 pt-12 pb-4 border-b border-zinc-900">
            <div>
              <h2 className="text-xl font-bold">{t("dsp.title")}</h2>
              <p className="text-xs text-zinc-600 mt-0.5">
                {t("dsp.subtitle")}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <Button
                variant="secondary"
                onClick={() => setShowDspAutoModal(true)}
                className="text-xs px-3 py-1.5 h-auto"
              >
                {t("dsp.autoButton")}
              </Button>
              <div className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full transition-all ${epicenterEnabled ? "bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)]" : "bg-zinc-700"}`}
                />
                <Switch
                  checked={epicenterEnabled}
                  onCheckedChange={toggleEpicenter}
                />
              </div>
            </div>
          </header>
          <div className="flex-1 flex flex-col justify-center px-4 py-8">
            <div className="card-elevated rounded-2xl p-6">
              <div className="grid grid-cols-3 gap-4 mb-6">
                <KnobControl
                  label={t("dsp.sweep")}
                  value={dspParams.sweepFreq}
                  min={27}
                  max={63}
                  step={1}
                  unit=" Hz"
                  onChange={(v) => updateDspParam("sweepFreq", v)}
                  disabled={!epicenterEnabled}
                />
                <KnobControl
                  label={t("dsp.width")}
                  value={dspParams.width}
                  min={0}
                  max={100}
                  step={1}
                  unit="%"
                  onChange={(v) => updateDspParam("width", v)}
                  disabled={!epicenterEnabled}
                />
                <KnobControl
                  label={t("dsp.intensity")}
                  value={dspParams.intensity}
                  min={0}
                  max={100}
                  step={1}
                  unit="%"
                  onChange={(v) => updateDspParam("intensity", v)}
                  disabled={!epicenterEnabled}
                />
              </div>
              <div className="flex justify-center gap-8">
                <KnobControl
                  label={t("dsp.balance")}
                  value={dspParams.balance}
                  min={0}
                  max={100}
                  step={1}
                  unit="%"
                  onChange={(v) => updateDspParam("balance", v)}
                  disabled={!epicenterEnabled}
                />
                <KnobControl
                  label={t("dsp.volume")}
                  value={dspParams.volume}
                  min={0}
                  max={100}
                  step={1}
                  unit="%"
                  onChange={(v) => updateDspParam("volume", v)}
                />
              </div>
            </div>
            <p className="text-center text-xs text-zinc-600 mt-6 px-8">
              {t("dsp.description")}
            </p>
          </div>
        </div>
      )}

      {showEqAutoModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-zinc-900 rounded-2xl p-6 w-full max-w-md border border-zinc-800 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold">{t("eq.autoTitle")}</h3>
                <p className="text-sm text-zinc-400 mt-1">
                  {t("eq.autoDescription")}
                </p>
              </div>
              <button
                onClick={() => setShowEqAutoModal(false)}
                className="text-zinc-500 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-xl">
              <p className="text-sm text-zinc-300">{t("eq.autoEnable")}</p>
              <Switch
                checked={eqAutoEnabled}
                onCheckedChange={setEqAutoEnabled}
              />
            </div>
            <Button
              onClick={() => {
                runAutoOptimization(true);
                setShowEqAutoModal(false);
              }}
              className="w-full bg-white text-black hover:bg-zinc-200"
            >
              {t("eq.autoApplyNow")}
            </Button>
          </div>
        </div>
      )}

      {showDspAutoModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-zinc-900 rounded-2xl p-6 w-full max-w-md border border-zinc-800 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold">{t("dsp.autoTitle")}</h3>
                <p className="text-sm text-zinc-400 mt-1">
                  {t("dsp.autoDescription")}
                </p>
              </div>
              <button
                onClick={() => setShowDspAutoModal(false)}
                className="text-zinc-500 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-xl">
              <p className="text-sm text-zinc-300">{t("dsp.autoEnable")}</p>
              <Switch
                checked={dspAutoEnabled}
                onCheckedChange={setDspAutoEnabled}
              />
            </div>
            <Button
              onClick={() => {
                runAutoOptimization(true);
                setShowDspAutoModal(false);
              }}
              className="w-full bg-white text-black hover:bg-zinc-200"
            >
              {t("dsp.autoApplyNow")}
            </Button>
          </div>
        </div>
      )}

      {/* Settings View */}
      {activeTab === "settings" && (
        <div className="flex-1 flex flex-col" data-testid="settings-view">
          <header className="px-6 pt-12 pb-6 border-b border-zinc-900">
            <h2 className="text-xl font-bold">{t("settings.title")}</h2>
          </header>
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
            {/* Appearance */}
            {switchable && (
              <div className="bg-zinc-900/50 rounded-2xl p-4">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-zinc-700/40 flex items-center justify-center">
                    <Disc3 className="w-5 h-5 text-zinc-300" />
                  </div>
                  <div>
                    <h3 className="font-semibold">
                      {t("settings.appearance")}
                    </h3>
                    <p className="text-xs text-zinc-500">
                      {t("settings.appearanceDescription")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-xl">
                  <div>
                    <p className="font-medium">{t("settings.theme")}</p>
                    <p className="text-xs text-zinc-500">
                      {theme === "dark"
                        ? t("settings.dark")
                        : t("settings.light")}
                    </p>
                  </div>
                  <Switch
                    checked={theme === "dark"}
                    onCheckedChange={toggleTheme}
                  />
                </div>
              </div>
            )}

            {/* Language */}
            <div className="bg-zinc-900/50 rounded-2xl p-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-blue-600/20 flex items-center justify-center">
                  <Globe className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h3 className="font-semibold">{t("settings.language")}</h3>
                  <p className="text-xs text-zinc-500">
                    {t("settings.languageDescription")}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <button
                  onClick={() => setLanguage("es")}
                  className={`w-full flex items-center justify-between p-3 rounded-xl transition-colors ${language === "es" ? "bg-white/10 border border-white/20" : "bg-zinc-800/50 hover:bg-zinc-800"}`}
                >
                  <span className="flex items-center gap-3">
                    <span className="text-lg">🇪🇸</span>
                    <span>{t("settings.spanish")}</span>
                  </span>
                  {language === "es" && (
                    <span className="w-2 h-2 rounded-full bg-white" />
                  )}
                </button>
                <button
                  onClick={() => setLanguage("en")}
                  className={`w-full flex items-center justify-between p-3 rounded-xl transition-colors ${language === "en" ? "bg-white/10 border border-white/20" : "bg-zinc-800/50 hover:bg-zinc-800"}`}
                >
                  <span className="flex items-center gap-3">
                    <span className="text-lg">🇺🇸</span>
                    <span>{t("settings.english")}</span>
                  </span>
                  {language === "en" && (
                    <span className="w-2 h-2 rounded-full bg-white" />
                  )}
                </button>
              </div>
            </div>

            {/* Crossfade */}
            <div className="bg-zinc-900/50 rounded-2xl p-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-green-600/20 flex items-center justify-center">
                  <Volume2 className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <h3 className="font-semibold">{t("settings.playback")}</h3>
                  <p className="text-xs text-zinc-500">
                    {t("settings.playbackDescription")}
                  </p>
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-zinc-800/50 rounded-xl">
                  <div>
                    <p className="font-medium">{t("settings.crossfade")}</p>
                    <p className="text-xs text-zinc-500">
                      {t("settings.crossfadeDescription")}
                    </p>
                  </div>
                  <Switch
                    checked={crossfade.enabled}
                    onCheckedChange={crossfade.setEnabled}
                  />
                </div>
                {crossfade.enabled && (
                  <div className="p-3 bg-zinc-800/30 rounded-xl">
                    <p className="text-sm text-zinc-400 mb-3">
                      {t("settings.crossfadeDuration")}
                    </p>
                    <div className="flex gap-2">
                      {[3, 5, 7, 10].map((s) => (
                        <button
                          key={s}
                          onClick={() => crossfade.setDuration(s)}
                          className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${crossfade.duration === s ? "bg-white text-black" : "bg-zinc-700/50 text-zinc-400 hover:bg-zinc-700"}`}
                        >
                          {s}s
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* How to use */}
            <div className="bg-zinc-900/50 rounded-2xl p-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-yellow-600/20 flex items-center justify-center">
                  <BookOpen className="w-5 h-5 text-yellow-400" />
                </div>
                <div>
                  <h3 className="font-semibold">{t("settings.howToUse")}</h3>
                  <p className="text-xs text-zinc-500">
                    {t("settings.howToUseDescription")}
                  </p>
                </div>
              </div>
              <Button
                asChild
                variant="secondary"
                className="w-full justify-between"
              >
                <Link href="/how-to-use">
                  <span>{t("settings.howToUseCta")}</span>
                  <ChevronRight className="w-4 h-4 text-zinc-400" />
                </Link>
              </Button>
            </div>

            {/* About */}
            <div className="bg-zinc-900/50 rounded-2xl p-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-purple-600/20 flex items-center justify-center">
                  <Info className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h3 className="font-semibold">{t("settings.about")}</h3>
                  <p className="text-xs text-zinc-500">
                    {t("settings.aboutDescription")}
                  </p>
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex items-center gap-4 p-3 bg-zinc-800/50 rounded-xl">
                  <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center">
                    <svg
                      className="w-8 h-8 text-white"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M13 3L4 14h7l-2 7 9-11h-7l2-7z" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="font-bold">{t("app.name")}</h4>
                    <p className="text-sm text-zinc-500">
                      {t("settings.version")} {t("app.version")}
                    </p>
                  </div>
                </div>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  {t("settings.description")}
                </p>
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                    {t("settings.features")}
                  </p>
                  <ul className="space-y-2 text-sm text-zinc-400">
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                      {t("settings.feature1")}
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                      {t("settings.feature2")}
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                      {t("settings.feature3")}
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                      {t("settings.feature4")}
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Legal */}
            <div className="bg-zinc-900/50 rounded-2xl p-4">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-emerald-600/20 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <h3 className="font-semibold">{t("settings.legal")}</h3>
                  <p className="text-xs text-zinc-500">
                    {t("settings.legalDescription")}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <Button
                  asChild
                  variant="secondary"
                  className="w-full justify-between"
                >
                  <Link href="/privacy">
                    <span>{t("settings.privacyPolicy")}</span>
                    <ChevronRight className="w-4 h-4 text-zinc-400" />
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="secondary"
                  className="w-full justify-between"
                >
                  <Link href="/terms">
                    <span>{t("settings.terms")}</span>
                    <ChevronRight className="w-4 h-4 text-zinc-400" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Import Progress */}
      {queue.importProgress.isImporting && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="bg-zinc-900 rounded-2xl p-6 w-full max-w-sm border border-zinc-800 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-purple-600/20 flex items-center justify-center">
                <Music2 className="w-5 h-5 text-purple-400 animate-pulse" />
              </div>
              <div>
                <h3 className="font-semibold text-white">
                  {t("actions.importingMusic")}
                </h3>
                <p className="text-sm text-zinc-400">
                  {t("actions.ofTotal", {
                    current: queue.importProgress.current + 1,
                    total: queue.importProgress.total,
                  })}
                </p>
              </div>
            </div>
            <div className="w-full h-2 bg-zinc-800 rounded-full overflow-hidden mb-3">
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300"
                style={{
                  width: `${((queue.importProgress.current + 1) / queue.importProgress.total) * 100}%`,
                }}
              />
            </div>
            <p className="text-xs text-zinc-500 truncate">
              {queue.importProgress.currentFileName}
            </p>
            <p className="text-center text-2xl font-bold text-white mt-4">
              {Math.round(
                ((queue.importProgress.current + 1) /
                  queue.importProgress.total) *
                  100,
              )}
              %
            </p>
          </div>
        </div>
      )}

      {/* Bottom Navigation */}
      <BottomNavigation
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onLibraryTab={() => {
          setActiveTab("library");
          setLibraryView("main");
        }}
        eqEnabled={audioProcessor.eqEnabled}
        epicenterEnabled={epicenterEnabled}
        t={t}
      />
      <div className={activeTab === "player" ? "h-0" : "h-20"} />
    </div>
  );
}

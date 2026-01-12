import React, { useState, useEffect, useRef, memo, useCallback, useMemo } from 'react';
import { 
  StyleSheet, Text, View, Image, TouchableOpacity, FlatList, 
  StatusBar, ScrollView, TextInput, ActivityIndicator,
  BackHandler, Modal, Platform, ImageBackground,
  useWindowDimensions, InteractionManager, Pressable, Switch
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';

// ========== THEME ==========
const THEME = {
  bg: '#000000',
  surface: '#1a1a1a',
  surfaceTranslucent: 'rgba(26, 26, 26, 0.95)',
  border: 'rgba(255,255,255,0.15)',
  text: '#ffffff',
  textSecondary: '#94a3b8',
  
  colLive: '#0047AB',
  colLiveBg: 'rgba(0, 71, 171, 0.4)',
  colLiveGradient: ['rgba(0, 26, 64, 0.8)', '#000000'],
  
  colRec: '#F1C40F',
  colRecBg: 'rgba(241, 196, 15, 0.3)',
  
  colShow: '#ea580c',     
  colShowBg: 'rgba(234, 88, 12, 0.4)',
  colShowGradient: ['rgba(124, 45, 18, 0.9)', '#000000'], 
  
  colMovie: '#16a34a',    
  colMovieBg: 'rgba(22, 163, 74, 0.4)',
  colMovieGradient: ['rgba(20, 83, 45, 0.9)', '#000000'],

  timelineNow: '#5DADE2',
  cardBg: '#1c1c1c', 
  
  navCapsuleBg: '#18181b', 
  activePillBg: '#ffffff',
  activePillText: '#000000',
  
  navColorLive: '#93c5fd',      
  navColorRec: '#fde047',       
  navColorShows: '#ea580c',     
  navColorMovies: '#16a34a',    
  navColorYoutube: '#FF0000',   
  navColorMusic: '#d8b4fe',     
  
  focusColor: '#00ccff',
  font: Platform.select({ ios: 'System', android: 'Roboto', default: 'sans-serif' }),
};

const ROW_HEIGHT = 90; 
const PIXELS_PER_MIN = 12; 
const CARD_WIDTH_LARGE = 220; 

// VOD Card Dimensions (Portrait)
const VOD_CARD_WIDTH = 150;
const VOD_CARD_HEIGHT = 225;

// Program Card Dimensions (Landscape 16:9)
const PROGRAM_CARD_WIDTH = 220;
const PROGRAM_CARD_HEIGHT = 124;

const SQUARE_CARD_SIZE = 140;
const SIDEBAR_ALIGNMENT = 30; 

// ========== TIME SERVICE ==========
// Simplified: Removed systemOffset entirely. 
// Now strictly: Local Device Time + Manual User Offset
const TimeService = {
  formatTime(timestamp, userOffset = 0) {
    const adjusted = timestamp + (userOffset * 3600000);
    const d = new Date(adjusted);
    return d.toISOString().substr(11, 5); 
  },
  now(userOffset = 0) {
    return Date.now() + (userOffset * 3600000);
  },
  formatDate(timestamp, userOffset = 0) {
    const adjusted = timestamp + (userOffset * 3600000);
    const d = new Date(adjusted);
    const day = d.getUTCDate().toString().padStart(2, '0');
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${day} ${months[d.getUTCMonth()]}`;
  },
  parseDate(str) {
    if (!str || str.length < 12) return Date.now();
    const y = str.substring(0, 4);
    const m = str.substring(4, 6) - 1;
    const d = str.substring(6, 8);
    const h = str.substring(8, 10);
    const mn = str.substring(10, 12);
    return Date.UTC(y, m, d, h, mn);
  }
};

// ========== DATA SERVICE ==========
const DataService = {
  decodeText(str) {
    if (!str) return "";
    return str.replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  },
  cleanName(name) {
    if (!name) return "";
    let clean = this.decodeText(name.trim());
    clean = clean.replace(/^[A-Z]{2,3}\s-\s/, '').replace(/\s\([A-Z]{2,3}\)$/, '');
    return clean;
  },
  getImageUri(item) {
      if (!item) return { uri: 'https://via.placeholder.com/150x225/333333/FFFFFF?text=No+Image' };
      const possible = [item.stream_icon, item.cover, item.logo, item.icon];
      for (const url of possible) {
          if (url && typeof url === 'string' && url.length > 5) {
              return { uri: url };
          }
      }
      return { uri: 'https://via.placeholder.com/150x225/333333/FFFFFF?text=No+Image' };
  },
  async fetchEPG(url, channels, onUpdate) {
    if (!url) return;
    InteractionManager.runAfterInteractions(async () => {
      try {
        const res = await fetch(url);
        const xml = await res.text();
        const channelMap = {};
        const nameMap = {};
        const now = Date.now();
        const winStart = now - (4 * 3600000); 
        const winEnd = now + (8 * 3600000);   
        channels.forEach(c => { 
            if(c.tvg_id) channelMap[c.tvg_id] = []; 
            if(c.name) nameMap[c.name.toLowerCase().replace(/[^a-z0-9]/g, '')] = []; 
        });
        const regex = /<programme[^>]*start="([^"]*)"[^>]*stop="([^"]*)"[^>]*channel="([^"]*)"[^>]*>([\s\S]*?)<\/programme>/g;
        let match;
        while ((match = regex.exec(xml)) !== null) {
          const [_, startStr, endStr, chId, content] = match;
          const isMapped = channelMap[chId] !== undefined;
          const lowerId = chId.toLowerCase().replace(/[^a-z0-9]/g, '');
          const isNamed = nameMap[lowerId] !== undefined;
          if (isMapped || isNamed) { 
            const s = TimeService.parseDate(startStr);
            const e = TimeService.parseDate(endStr);
            if (e > winStart && s < winEnd) {
               const titleMatch = content.match(/<title[^>]*>([^<]*)<\/title>/);
               const title = titleMatch ? DataService.decodeText(titleMatch[1]) : "No Title";
               const descMatch = content.match(/<desc[^>]*>([^<]*)<\/desc>/);
               let desc = descMatch ? DataService.decodeText(descMatch[1]) : "";
               if (desc.length > 200) desc = desc.substring(0, 200) + "...";
               const iconMatch = content.match(/<icon[^>]*src="([^"]*)"/);
               const icon = iconMatch ? iconMatch[1] : "";
               const prog = { title, desc, icon, start: s, end: e, duration: (e-s)/60000 };
               if (isMapped) channelMap[chId].push(prog);
               if (isNamed) nameMap[lowerId].push(prog);
            }
          }
        }
        const updatedChannels = channels.map(c => {
          let progs = [];
          if (c.tvg_id && channelMap[c.tvg_id]?.length > 0) progs = channelMap[c.tvg_id];
          else if (c.name) {
             const norm = c.name.toLowerCase().replace(/[^a-z0-9]/g, '');
             if (nameMap[norm]?.length > 0) progs = nameMap[norm];
          }
          if (progs.length > 0) {
             const unique = progs.filter((v,i,a)=>a.findIndex(t=>(t.start===v.start))===i);
             return { ...c, epg: unique.sort((a,b) => a.start - b.start), epgLoaded: true };
          }
          return { ...c, epg: [], epgLoaded: true };
        });
        onUpdate(updatedChannels);
      } catch (e) { console.log("EPG Fetch failed (Silent)"); }
    });
  }
};

// ========== UI COMPONENTS ==========

const Focusable = ({ children, style, onFocus, onBlur, onPress, styleFocused, ...props }) => {
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      {...props}
      onPress={onPress}
      focusable={true} 
      onFocus={() => { setFocused(true); if(onFocus) onFocus(); }}
      onBlur={() => { setFocused(false); if(onBlur) onBlur(); }}
      style={({ pressed }) => [
        style,
        focused && { 
            borderColor: THEME.focusColor, 
            borderWidth: 3, 
            shadowColor: THEME.focusColor, 
            shadowRadius: 10, 
            shadowOpacity: 0.8,
            elevation: 10, 
            zIndex: 999 
        },
        focused && styleFocused,
        pressed && { opacity: 0.7 }
      ]}
    >
      {children}
    </Pressable>
  );
};

const LoadingScreen = ({ progress, status }) => (
  <View style={styles.loadingContainer}>
    <StatusBar hidden />
    <View style={styles.loadingContent}>
      <ActivityIndicator size="large" color={THEME.colLive} style={{ marginBottom: 20 }} />
      <Text style={styles.loadingTitle}>Setting up TV</Text>
      <View style={styles.progressBarBg}>
        <View style={{ ...styles.progressBarFill, width: `${progress}%` }} />
      </View>
      <Text style={styles.loadingStatus}>{status}</Text>
    </View>
  </View>
);

const NavItem = memo(({ label, active, onPress, type = 'category', colorOverride }) => {
  if (type === 'global') {
    const isRed = colorOverride === '#FF0000';
    const containerStyle = [
      styles.globalNavItem,
      active && styles.globalNavItemActive,
      (isRed && !active) && { backgroundColor: 'transparent' } 
    ];
    const textStyle = [
      styles.globalNavText,
      active ? styles.globalNavTextActive : { color: isRed ? '#FF0000' : (colorOverride || THEME.textSecondary) }
    ];
    return (
      <Focusable onPress={onPress} style={containerStyle} styleFocused={{backgroundColor: '#333'}}>
        <Text style={textStyle}>{label}</Text>
      </Focusable>
    );
  }
  let bgColor = 'transparent'; 
  let textColor = THEME.textSecondary;
  let borderColor = 'transparent';
  if (active) {
    bgColor = THEME.colLiveBg; 
    borderColor = THEME.colLive; 
    textColor = 'white'; 
  }
  return (
    <Focusable onPress={onPress} style={[styles.pill, { backgroundColor: bgColor, borderColor: borderColor, borderWidth: active ? 1 : 0 }]}>
      <Text style={[styles.pillText, { color: textColor, fontWeight: active ? '800' : '600' }]}>{label}</Text>
    </Focusable>
  );
});

const VodSidebarItem = memo(({ label, active, onPress, activeColor }) => (
    <Focusable 
        onPress={onPress} 
        style={[
            styles.sidebarItem, 
            active && { backgroundColor: activeColor || THEME.colLive, borderColor: 'transparent' }
        ]}
        styleFocused={{ backgroundColor: 'rgba(255,255,255,0.2)', borderColor: THEME.focusColor, borderWidth: 2 }}
    >
        <Text style={[styles.sidebarText, active && styles.sidebarTextActive]} numberOfLines={1}>{label}</Text>
    </Focusable>
));

const VodCard = ({ item, onPress }) => {
    const [focused, setFocused] = useState(false);
    return (
        <View style={{ alignItems: 'center', marginRight: 20, marginBottom: 40, width: VOD_CARD_WIDTH }}>
            <Pressable 
                onPress={() => onPress(item)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                style={[
                    styles.vodCard,
                    focused && { 
                        transform: [{ scale: 1.05 }], 
                        borderColor: THEME.focusColor, 
                        borderWidth: 2,
                        zIndex: 100 
                    }
                ]}
            >
                <Image source={DataService.getImageUri(item)} style={styles.vodImage} resizeMode="cover" />
            </Pressable>
            
            <View style={[styles.vodHoverDetails, { opacity: focused ? 1 : 0 }]}>
                <Text style={styles.vodTitle}>{DataService.cleanName(item.name || item.title)}</Text>
                {item.rating && <Text style={styles.vodMeta}>★ {item.rating}</Text>}
            </View>
        </View>
    );
};

// --- PROGRAM CARD (Landscape 16:9, Dark BG, Left Aligned) ---
const ProgramCard = memo(({ program, channel, onPress, width, timeZone }) => {
    const imageUri = (program.icon && program.icon.length > 10) ? { uri: program.icon } : { uri: channel.logo };
    const [focused, setFocused] = useState(false);
    
    // Updated: No systemOffset
    const startTime = TimeService.formatTime(program.start, timeZone);
    const endTime = TimeService.formatTime(program.end, timeZone);

    return (
        <Focusable 
            onPress={onPress}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={[
                styles.programCard,
                { width: width },
                focused && { 
                    transform: [{ scale: 1.05 }], 
                    borderColor: THEME.focusColor, 
                    borderWidth: 2,
                    zIndex: 100 
                }
            ]}
        >
            <View style={styles.programImageContainer}>
                <Image source={imageUri} style={styles.programImage} resizeMode="cover" />
                <View style={styles.programLogoContainer}>
                    <Image source={{ uri: channel.logo }} style={styles.programLogo} resizeMode="contain" />
                </View>
            </View>
            <View style={styles.programInfo}>
                <Text style={styles.programTitle} numberOfLines={1} ellipsizeMode="tail">
                    {DataService.decodeText(program.title)}
                </Text>
                <Text style={styles.programTime}>{startTime} - {endTime}</Text>
                <Text style={styles.programChannelName} numberOfLines={1} ellipsizeMode="tail">
                    {DataService.cleanName(channel.name)}
                </Text>
            </View>
        </Focusable>
    );
});

// --- CHANNEL SQUARE CARD ---
const ChannelSquareCard = ({ item, onPress }) => (
    <View style={styles.cardWrapper}>
        <Focusable style={[styles.cardSquare, { backgroundColor: THEME.cardBg }]} onPress={() => onPress(item)}>
          <Image source={DataService.getImageUri(item)} style={{ width: '70%', height: '60%' }} resizeMode="contain" />
          {(item.isGroup || (item.channels && item.channels.length > 1)) && (
              <View style={styles.groupBadge}><Text style={styles.groupBadgeText}>{item.channels?.length || 1}</Text></View>
          )}
        </Focusable>
        <Text style={styles.cardTitleUnder} numberOfLines={1}>{DataService.cleanName(item.name || item.title)}</Text>
    </View>
);

const VodRow = memo(({ title, data, onPress }) => {
    if (!data || data.length === 0) return null;
    return (
        <View style={styles.vodRowContainer}>
            <Text style={styles.rowTitle}>{title}</Text>
            <FlatList
                horizontal
                data={data}
                renderItem={({ item }) => <VodCard item={item} onPress={onPress} />}
                keyExtractor={(item) => item.stream_id?.toString() || item.series_id?.toString() || Math.random().toString()}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 40, paddingTop: 10, paddingBottom: 10 }} 
            />
        </View>
    );
});

const ChannelRow = memo(({ item, isSelected, onSelect, viewStart, onProgramSelect, currentTime, userOffset }) => (
    <View style={[styles.row, isSelected && styles.rowSelected]}>
      <Focusable style={styles.rowSidebar} onPress={() => onSelect(item)} styleFocused={{backgroundColor: '#333'}}>
        <Text style={styles.rowNum}>{item.num}</Text>
        <View style={styles.logoContainer}>
           <Image source={DataService.getImageUri(item)} style={styles.rowLogo} resizeMode="contain" />
        </View>
        <Text style={styles.rowName} numberOfLines={1}>{DataService.cleanName(item.name)}</Text>
      </Focusable>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} scrollEnabled={false} style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', height: '100%', alignItems: 'center' }}>
          {item.epg && item.epg.length > 0 ? (
            item.epg.map((prog, i) => {
              const startDiff = (prog.start - viewStart) / 60000;
              const width = prog.duration * PIXELS_PER_MIN;
              const left = startDiff * PIXELS_PER_MIN;
              
              if (left + width < -50 || left > 4000) return null; 
              
              const stickyOffset = left < 0 ? Math.abs(left) + 10 : 10;
              
              // Highlight current program
              const isCurrent = currentTime >= prog.start && currentTime < prog.end;
              const blockColor = isCurrent ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)';

              return (
                <Focusable 
                  key={prog.start} 
                  style={[
                      styles.progBlock, 
                      { left, width: Math.max(width - 2, 1), backgroundColor: blockColor }
                  ]}
                  onPress={() => onProgramSelect(item, prog)}
                  styleFocused={{ backgroundColor: 'rgba(255,255,255,0.4)', borderColor: THEME.focusColor, borderWidth: 1 }}
                >
                  <Text 
                    style={[styles.progTitle, { paddingLeft: stickyOffset }]} 
                    numberOfLines={1}
                  >
                    {prog.title}
                  </Text>
                  {width > 100 && (
                    <Text style={[styles.progTime, { paddingLeft: stickyOffset }]}>
                      {TimeService.formatTime(prog.start, userOffset)} - {TimeService.formatTime(prog.end, userOffset)}
                    </Text>
                  )}
                </Focusable>
              );
            })
          ) : (
            <View style={[styles.progBlock, { left: 0, width: 2000, backgroundColor: 'transparent' }]}>
              <Text style={{color: '#666', fontStyle:'italic', marginLeft: 20}}>
                 {item.epgLoaded ? "No Program Information" : "Loading Guide..."}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
), (prev, next) => prev.isSelected === next.isSelected && prev.viewStart === next.viewStart && prev.item.id === next.item.id && prev.item.epg === next.item.epg && prev.currentTime === next.currentTime);

const GridCard = memo(({ item, onSelect, width }) => (
  <View style={[styles.gridCardWrapper, { width: width }]}>
    <Focusable style={[styles.gridCard, { backgroundColor: THEME.cardBg }]} onPress={() => onSelect(item)}>
      <View style={styles.gridIconContainer}>
        <Image source={DataService.getImageUri(item)} style={styles.gridLogo} resizeMode="contain" />
        {(item.isGroup || (item.channels && item.channels.length > 1)) && (
             <View style={styles.groupBadge}><Text style={styles.groupBadgeText}>{item.channels?.length || 1}</Text></View>
        )}
      </View>
    </Focusable>
    <Text style={styles.gridNameUnder} numberOfLines={1}>{DataService.cleanName(item.name)}</Text>
  </View>
));

const ContentRow = memo(({ title, data, onPress, type }) => {
  const renderItem = useCallback(({ item }) => {
    const isVOD = item.stream_id || item.series_id;
    if (isVOD && type !== 'square') {
        return <VodCard item={item} onPress={onPress} />;
    } else {
        return <ChannelSquareCard item={item} onPress={onPress} />;
    }
  }, [type, onPress]);

  if (!data || data.length === 0) return null;

  return (
    <View style={{ marginBottom: 25 }}>
      <Text style={styles.rowTitle}>{title}</Text>
      <FlatList 
        horizontal 
        data={data} 
        renderItem={renderItem} 
        keyExtractor={(item) => item.id || item.stream_id || item.series_id || Math.random().toString()} 
        showsHorizontalScrollIndicator={false} 
        contentContainerStyle={{ paddingHorizontal: 40, alignItems: 'flex-end' }} 
        maxToRenderPerBatch={5} 
        initialNumToRender={5} 
        windowSize={3} 
      />
    </View>
  );
});

const StreamSelectionModal = ({ visible, group, onSelect, onClose }) => {
  if (!visible || !group) return null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.settingsOverlay}>
        <View style={styles.settingsModal}>
          <Text style={styles.modalTitle}>Select Stream</Text>
          <Text style={styles.label}>{group.name}</Text>
          <FlatList
            data={group.channels}
            keyExtractor={(item, index) => index.toString()}
            style={{ maxHeight: 300, marginVertical: 10 }}
            showsVerticalScrollIndicator={false}
            renderItem={({ item, index }) => (
              <Focusable style={styles.streamOption} onPress={() => onSelect(item)}>
                <Ionicons name="play-circle-outline" size={24} color={THEME.colLive} />
                <Text style={styles.streamOptionText}>Stream {index + 1}</Text>
              </Focusable>
            )}
          />
          <Focusable style={styles.btnClose} onPress={onClose}><Text style={{color:'#aaa'}}>Cancel</Text></Focusable>
        </View>
      </View>
    </Modal>
  );
};

const PlayerModal = ({ visible, item, onClose }) => {
  if (!item) return null;
  const uri = item.stream || item.url;
  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'black' }}>
        <Video source={{ uri: uri }} style={StyleSheet.absoluteFill} resizeMode={ResizeMode.CONTAIN} shouldPlay useNativeControls />
        <Focusable style={styles.closePlayerBtn} onPress={onClose}><Ionicons name="close" size={30} color="white" /></Focusable>
      </View>
    </Modal>
  );
};

const SettingsModal = ({ visible, onClose, settings, onSave }) => {
  const [localSettings, setLocalSettings] = useState(settings);
  useEffect(() => { if (visible) setLocalSettings(settings); }, [visible, settings]);
  const updateSetting = (key, value) => setLocalSettings(prev => ({ ...prev, [key]: value }));
  
  // Tabs toggle logic
  const [tabs, setTabs] = useState(settings.visibleTabs || { live: true, recordings: true, movies: true, series: true, youtube: true, music: true });
  useEffect(() => { if(visible && settings.visibleTabs) setTabs(settings.visibleTabs); }, [visible, settings]);
  
  const toggleTab = (key) => setTabs(prev => ({ ...prev, [key]: !prev[key] }));

  const changeTimeZone = (dir) => {
      const current = localSettings.timeZone || 0;
      updateSetting('timeZone', current + dir);
  };
  
  const handleSave = () => {
      onSave({ ...localSettings, visibleTabs: tabs });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.settingsOverlay}>
        <View style={styles.settingsModal}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.modalTitle}>Settings</Text>
            
            <Text style={styles.label}>Content Visibility</Text>
            <View style={{ marginBottom: 20 }}>
                {Object.keys(tabs).map(key => (
                    <View key={key} style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10}}>
                        <Text style={{color: 'white', textTransform: 'capitalize'}}>{key}</Text>
                        <Switch 
                            value={tabs[key]} 
                            onValueChange={() => toggleTab(key)} 
                            trackColor={{false: '#333', true: THEME.colLive}} 
                            thumbColor={'white'}
                        />
                    </View>
                ))}
            </View>

            <Text style={styles.label}>Time Zone Offset (From UTC)</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
                <Focusable style={styles.tzBtn} onPress={() => changeTimeZone(-1)}><Ionicons name="remove" size={24} color="white"/></Focusable>
                <Text style={{ color: 'white', fontSize: 18, marginHorizontal: 20, fontWeight:'bold' }}>
                    {localSettings.timeZone > 0 ? `+${localSettings.timeZone}` : localSettings.timeZone || "GMT"}
                </Text>
                <Focusable style={styles.tzBtn} onPress={() => changeTimeZone(1)}><Ionicons name="add" size={24} color="white"/></Focusable>
            </View>

            <Text style={styles.label}>Xtream Codes URL</Text>
            <TextInput style={styles.input} value={localSettings.xcUrl} onChangeText={(v) => updateSetting('xcUrl', v)} placeholder="http://url.com" placeholderTextColor="#666" />
            <Text style={styles.label}>Username</Text>
            <TextInput style={styles.input} value={localSettings.xcUser} onChangeText={(v) => updateSetting('xcUser', v)} placeholder="username" placeholderTextColor="#666" />
            <Text style={styles.label}>Password</Text>
            <TextInput style={styles.input} value={localSettings.xcPass} onChangeText={(v) => updateSetting('xcPass', v)} placeholder="password" placeholderTextColor="#666" secureTextEntry />
            
            <Focusable style={styles.btnSave} onPress={handleSave}><Text style={styles.btnText}>SAVE & RELOAD</Text></Focusable>
            <Focusable style={styles.btnClose} onPress={onClose}><Text style={{color:'#aaa'}}>Cancel</Text></Focusable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

// ========== MAIN APP ==========
export default function App() {
  const [allChannels, setAllChannels] = useState([]);
  const [liveCategories, setLiveCategories] = useState([]); 
  const [selectedChannel, setSelectedChannel] = useState(null);
  
  // VOD
  const [vodMovies, setVodMovies] = useState([]);
  const [vodSeries, setVodSeries] = useState([]);
  const [movieCategories, setMovieCategories] = useState([]);
  const [seriesCategories, setSeriesCategories] = useState([]);
  const [vodCategory, setVodCategory] = useState('all'); 
  // History Data
  const [watchHistory, setWatchHistory] = useState([]);

  // Mock Data Placeholders
  const [vodContinueMovies, setVodContinueMovies] = useState([]);
  const [vodWatchlistMovies, setVodWatchlistMovies] = useState([]);
  const [vodContinueSeries, setVodContinueSeries] = useState([]);
  const [vodWatchlistSeries, setVodWatchlistSeries] = useState([]);


  const [playingItem, setPlayingItem] = useState(null);
  const [manualPreviewItem, setManualPreviewItem] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);
  
  const [currentTab, setCurrentTab] = useState('home'); 
  const [activeCategory, setActiveCategory] = useState('All Channels');
  const [navMode, setNavMode] = useState('main'); 
  const [selectedGroup, setSelectedGroup] = useState(null);

  // Settings with defaults
  const [settings, setSettings] = useState({ 
      xcUrl: '', xcUser: '', xcPass: '', timeZone: 0,
      visibleTabs: { live: true, recordings: true, movies: true, series: true, youtube: true, music: true }
  });
  // Removed systemOffset state
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [viewStart, setViewStart] = useState(0);

  const { width: windowWidth } = useWindowDimensions();
  const numColumns = Math.floor((windowWidth - 40) / 170) || 4; 
  // Correct VOD column calculation
  const vodColumns = Math.floor((windowWidth - 280) / 170) || 4;
  const listRef = useRef(null);
  const safetyTimeout = useRef(null);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadStatus, setLoadStatus] = useState("Initializing...");
  const isFetchingRef = useRef(false);
  const abortControllerRef = useRef(null); 
  const [isFull, setIsFull] = useState(false);

  // Background Gradient Color Logic
  const getGradientColors = () => {
      if (currentTab === 'movies') return THEME.colMovieGradient;
      if (currentTab === 'tvshows') return THEME.colShowGradient;
      return THEME.colLiveGradient;
  };

  const CAT_ALL_CHANNELS = 'All Channels';
  const CAT_ALL_SPORTS = 'All Sports';
  const CAT_SPORTS = 'Sports';
  const CAT_SPORTS_EXTRA = 'Sports Extra'; 
  const CAT_MAIN_EXTRA = 'VOD Extra'; 

  // --- TIME & AUTO LOGIN ---
  useEffect(() => {
      // Replaced network fetch with local calculation in useCallback
      fetchServerTime();
      
      // Load watch history on start
      AsyncStorage.getItem('watchHistory').then(json => {
          if (json) setWatchHistory(JSON.parse(json));
      }).catch((e) => {
        // ignore error
        console.log(e);
      });

      const checkLogin = async () => {
          try {
              const stored = await AsyncStorage.getItem('settings');
              if (stored) {
                  const parsed = JSON.parse(stored);
                  if (!parsed.visibleTabs) {
                      parsed.visibleTabs = { live: true, recordings: true, movies: true, series: true, youtube: true, music: true };
                  }
                  setSettings(parsed);
                  if (parsed.xcUrl) {
                      loadXtream(parsed);
                  } else {
                      setIsFirstLoad(false);
                      setIsSettingsOpen(true);
                  }
              } else {
                  setIsFirstLoad(false);
                  setIsSettingsOpen(true);
              }
          } catch(e) {
              setIsFirstLoad(false);
              setIsSettingsOpen(true);
          }
      };
      
      const timer = setTimeout(() => checkLogin(), 500);
      safetyTimeout.current = setTimeout(() => {
          if (isFirstLoad) {
              setIsFirstLoad(false);
              setIsSettingsOpen(true);
          }
      }, 15000); 

      return () => { clearTimeout(timer); clearTimeout(safetyTimeout.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save history on change
  useEffect(() => {
      AsyncStorage.setItem('watchHistory', JSON.stringify(watchHistory)).catch(()=>{});
  }, [watchHistory]);

  // Simplified fetchServerTime - just sets viewStart based on local device time
  const fetchServerTime = useCallback(async () => {
      const now = Date.now() + (settings.timeZone * 3600000);
      const snapped = Math.floor(now / 1800000) * 1800000;
      setViewStart(snapped);
  }, [settings.timeZone]);


  useEffect(() => {
      const timer = setInterval(() => {
          const now = TimeService.now(settings.timeZone);
          setCurrentTime(now);
      }, 60000);
      return () => clearInterval(timer);
  }, [settings.timeZone]);

  // --- FILTERING ---
  const filteredChannels = useMemo(() => {
    if (!allChannels || allChannels.length === 0) return [];
    
    let res = [];
    if (activeCategory === CAT_ALL_CHANNELS) {
        res = allChannels.filter(c => !c.cat_name.toLowerCase().includes('sport') && !c.cat_name.includes('Extra'));
    } else if (activeCategory === CAT_ALL_SPORTS) {
        res = allChannels.filter(c => c.cat_name.toLowerCase().includes('sport'));
    } else if (activeCategory === CAT_SPORTS) {
        res = allChannels.filter(c => c.cat_name.toLowerCase().includes('sport') && !c.cat_name.includes('Extra'));
    } else if (activeCategory === CAT_SPORTS_EXTRA) {
        res = allChannels.filter(c => c.cat_name.toLowerCase().includes('sport') && c.cat_name.includes('Extra'));
    } else if (activeCategory === CAT_MAIN_EXTRA) {
        res = allChannels.filter(c => (c.cat_name === 'Extra' || c.cat_name === 'Adult' || (c.cat_name.includes('Extra') && !c.cat_name.toLowerCase().includes('sport'))));
    } else if (activeCategory === 'Favourites') {
        res = [];
    } else {
        res = allChannels.filter(c => c.cat_name === activeCategory);
    }

    if (activeCategory === CAT_MAIN_EXTRA || activeCategory === CAT_SPORTS_EXTRA) {
        const grouped = [];
        const map = new Map();
        res.forEach(ch => {
            const clean = DataService.cleanName(ch.name);
            const groupKey = clean.replace(/\s(FHD|HD|SD|HEVC|CA|US|UK)$/i, '').trim(); 
            if (!map.has(groupKey)) map.set(groupKey, []);
            map.get(groupKey).push(ch);
        });
        map.forEach((list, name) => {
            if (list.length > 1) {
                 grouped.push({ id: `group_${name}`, name: name, logo: list[0].logo, isGroup: true, channels: list, num: list[0].num });
            } else {
                 grouped.push(list[0]);
            }
        });

        if (activeCategory === CAT_SPORTS_EXTRA) {
            return grouped.sort((a,b) => {
                const numA = parseInt(a.num || (a.channels ? a.channels[0].num : 0));
                const numB = parseInt(b.num || (b.channels ? b.channels[0].num : 0));
                return numA - numB;
            });
        } else {
            return grouped.sort((a,b) => a.name.localeCompare(b.name));
        }
    }
    return res;
  }, [allChannels, activeCategory]);

  const addToHistory = (item) => {
      setWatchHistory(prev => {
          const filtered = prev.filter(i => {
              if (item.stream_id && item.stream_id === i.stream_id) return false;
              if (item.series_id && item.series_id === i.series_id) return false;
              if (item.id && item.id === i.id) return false;
              return true;
          });
          return [item, ...filtered].slice(0, 10);
      });
  };

  const handlePlayVOD = (item) => {
      addToHistory(item);
      setPlayingItem(item);
  };

  const getContinueWatchingData = (type) => {
      if (type === 'Home') {
          let history = [...watchHistory];
          // Filter if toggle is off
          if (!settings.visibleTabs.movies) history = history.filter(i => !i.stream_id || i.num);
          if (!settings.visibleTabs.series) history = history.filter(i => !i.series_id);
          if (!settings.visibleTabs.live) history = history.filter(i => !i.num);

          if (selectedChannel && settings.visibleTabs.live) {
              history = history.filter(i => i.id !== selectedChannel.id);
              return [selectedChannel, ...history].slice(0, 5); 
          }
          return history.slice(0, 5);
      }
      return watchHistory.filter(i => {
         if (type === 'Movies') return i.stream_id && !i.num; 
         if (type === 'TV Shows') return i.series_id;
         return false;
      });
  };

  const getFilteredVOD = (type, categoryId) => {
      const source = type === 'Movies' ? vodMovies : vodSeries;
      if (!categoryId || categoryId === 'all') return source;
      if (categoryId === 'continue') return getContinueWatchingData(type);
      if (categoryId === 'watchlist') return []; 
      return source.filter(i => i.category_id === categoryId);
  };

  const getAlphaSortedGroups = useMemo(() => {
    if (activeCategory !== CAT_MAIN_EXTRA) return [];
    if (!filteredChannels || filteredChannels.length === 0) return [];
    const buckets = { '0-9': [] };
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    letters.forEach(l => buckets[l] = []);
    filteredChannels.forEach(item => {
        const name = DataService.cleanName(item.name).toUpperCase();
        const firstChar = name.charAt(0);
        if (/[0-9]/.test(firstChar)) buckets['0-9'].push(item);
        else if (buckets[firstChar]) buckets[firstChar].push(item);
        else buckets['0-9'].push(item);
    });
    const sections = [];
    if (buckets['0-9'].length > 0) sections.push({ title: '0-9', data: buckets['0-9'] });
    letters.forEach(l => { if (buckets[l].length > 0) sections.push({ title: l, data: buckets[l] }); });
    return sections;
  }, [filteredChannels, activeCategory]);

  useEffect(() => {
     if (listRef.current && filteredChannels.length > 0) {
        listRef.current.scrollToOffset({ offset: 0, animated: false });
     }
  }, [activeCategory, filteredChannels]);

  useEffect(() => {
    const initChannel = async () => {
        if (allChannels.length > 0 && !selectedChannel) {
            try {
                const lastId = await AsyncStorage.getItem('lastWatchedChannelId');
                if (lastId) {
                    const found = allChannels.find(c => c.id === lastId);
                    if (found) {
                        setSelectedChannel(found);
                        return;
                    }
                }
            } catch(e) {}
            const first = allChannels.find(c => !c.cat_name.includes('Extra') && !c.isGroup);
            if (first) setSelectedChannel(first);
        }
    };
    initChannel();
  }, [allChannels, selectedChannel]); 

  // --- SYNC SELECTED CHANNEL ---
  useEffect(() => {
    if (allChannels.length > 0 && selectedChannel) {
      const updatedObj = allChannels.find(c => c.id === selectedChannel.id);
      if (updatedObj && updatedObj !== selectedChannel) {
          setSelectedChannel(updatedObj);
          setManualPreviewItem(null); 
      }
    }
  }, [allChannels, selectedChannel]); 

  // --- PREVIEW MEMO ---
  const activePreviewItem = useMemo(() => {
     if (manualPreviewItem) return manualPreviewItem;
     if (!selectedChannel) return null;
     
     const now = currentTime; 
     const currentProg = selectedChannel.epg?.find(p => p.start <= now && p.end > now);
     const isExtra = selectedChannel.cat_name?.includes('Extra');
     const defaultDesc = isExtra || !selectedChannel.epgLoaded ? (selectedChannel.name || "Stream") : "Loading Program Information...";

     return {
        title: currentProg ? DataService.decodeText(currentProg.title) : DataService.cleanName(selectedChannel.name),
        desc: currentProg ? DataService.decodeText(currentProg.desc) : defaultDesc,
        image: currentProg?.icon || selectedChannel.logo, 
        logo: selectedChannel.logo,
        time: currentProg ? `${TimeService.formatTime(currentProg.start, settings.timeZone)} - ${TimeService.formatTime(currentProg.end, settings.timeZone)}` : ""
     };
  }, [selectedChannel, currentTime, manualPreviewItem, settings.timeZone]); 

  const onProgramSelect = useCallback((channel, program) => {
     setManualPreviewItem({
        title: DataService.decodeText(program.title),
        desc: DataService.decodeText(program.desc) || "No description.",
        image: program.icon || channel.logo, 
        logo: channel.logo,
        time: `${TimeService.formatTime(program.start, settings.timeZone)} - ${TimeService.formatTime(program.end, settings.timeZone)}`
     });
  }, [settings.timeZone]);

  const handleSearchSelect = useCallback((item, type) => {
      if (type === 'movie' || type === 'series') {
          setPlayingItem(item);
          addToHistory(item);
          setIsSearchActive(false);
          setSearchQuery('');
          return;
      }
      
      const targetChannel = type === 'channel' ? item : item.channel;
      const targetProgram = type === 'program' ? item.program : null;

      setCurrentTab('live');
      setActiveCategory(CAT_ALL_CHANNELS); 
      setSelectedChannel(targetChannel);
      addToHistory(targetChannel);
      AsyncStorage.setItem('lastWatchedChannelId', targetChannel.id);
      
      setManualPreviewItem(null); 

      if (targetProgram) {
          setViewStart(targetProgram.start); 
          onProgramSelect(targetChannel, targetProgram); 
      } else {
          const now = TimeService.now(settings.timeZone);
          const snapped = Math.floor(now / 1800000) * 1800000;
          setViewStart(snapped);
          setManualPreviewItem(null); 
      }

      setTimeout(() => {
          const index = allChannels.filter(c => !c.cat_name.toLowerCase().includes('sport') && !c.cat_name.includes('Extra')).findIndex(c => c.id === targetChannel.id);
          if (index !== -1 && listRef.current) {
              const offset = index * ROW_HEIGHT;
              const centeredOffset = Math.max(0, offset - 300);
              listRef.current.scrollToOffset({ offset: centeredOffset, animated: true });
          }
      }, 500);

      setIsSearchActive(false);
      setSearchQuery('');
  }, [allChannels, onProgramSelect, settings.timeZone]);

  const handleGridSelect = useCallback((item) => {
    if (item.isGroup) {
        setSelectedGroup(item);
    } else {
        setSelectedChannel(item);
        addToHistory(item);
        AsyncStorage.setItem('lastWatchedChannelId', item.id);
        setManualPreviewItem(null);
    }
  }, []);

  const onChannelSelect = useCallback((item) => {
      setSelectedChannel(item);
      addToHistory(item);
      AsyncStorage.setItem('lastWatchedChannelId', item.id);
      setManualPreviewItem(null);
  }, []);

  const onScrollToIndexFailed = (info) => {
      const wait = new Promise(resolve => setTimeout(resolve, 500));
      wait.then(() => {
          if (listRef.current) {
              const offset = info.index * ROW_HEIGHT;
              listRef.current.scrollToOffset({ offset: offset, animated: true });
          }
      });
  };

  const handleNavClick = useCallback((cat) => {
    setManualPreviewItem(null);
    if (cat === 'Sports') { 
        setNavMode('sports'); 
        setActiveCategory(CAT_ALL_SPORTS); 
    } else if (cat === 'Extra') { 
        setNavMode('main'); 
        setActiveCategory(CAT_MAIN_EXTRA); 
    } else { 
        setNavMode('main'); 
        setActiveCategory(cat); 
    }
  }, []);

  const switchToLive = () => {
      setCurrentTab('live');
      setManualPreviewItem(null);
      const now = TimeService.now(settings.timeZone);
      const snapped = Math.floor(now / 1800000) * 1800000;
      setViewStart(snapped);
  };

  const switchToVod = (type) => {
      setCurrentTab(type);
      setVodCategory('all');
  };

  const handleBack = useCallback(() => {
    setManualPreviewItem(null);
    if (selectedGroup) { setSelectedGroup(null); return true; }
    if (playingItem) { setPlayingItem(null); return true; }
    if (isFull) { setIsFull(false); return true; }
    if (isSettingsOpen) { setIsSettingsOpen(false); return true; }
    if (isSearchActive) { setIsSearchActive(false); setSearchQuery(''); return true; }
    if (navMode === 'sports' || activeCategory === CAT_MAIN_EXTRA) { 
        setNavMode('main'); 
        setActiveCategory(CAT_ALL_CHANNELS); 
        return true; 
    }
    if (currentTab !== 'home') { 
        setCurrentTab('home'); 
        return true; 
    }
    return false; 
  }, [selectedGroup, playingItem, isFull, isSettingsOpen, isSearchActive, navMode, activeCategory, currentTab]);

  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', handleBack);
    return () => backHandler.remove();
  }, [handleBack]);


  const shiftTime = (minutes) => {
     setViewStart(prev => prev + (minutes * 60000));
  };

  const saveSettings = async (newSettings) => {
    await AsyncStorage.setItem('settings', JSON.stringify(newSettings));
    setSettings(newSettings);
    setIsSettingsOpen(false);
    setIsFirstLoad(true); 
    loadXtream(newSettings);
  };

  const loadXtream = async (sett) => {
    const { xcUrl, xcUser, xcPass } = sett;
    if (!xcUrl) return; 
    
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    
    try {
      setLoadStatus("Authenticating..."); setLoadProgress(20);
      const catRes = await fetch(`${xcUrl}/player_api.php?username=${xcUser}&password=${xcPass}&action=get_live_categories`, { signal });
      const catJson = await catRes.json();
      if (Array.isArray(catJson)) setLiveCategories(catJson);
      
      const movCatRes = await fetch(`${xcUrl}/player_api.php?username=${xcUser}&password=${xcPass}&action=get_vod_categories`, { signal });
      const movCatJson = await movCatRes.json();
      if (Array.isArray(movCatJson)) setMovieCategories(movCatJson);

      const serCatRes = await fetch(`${xcUrl}/player_api.php?username=${xcUser}&password=${xcPass}&action=get_series_categories`, { signal });
      const serCatJson = await serCatRes.json();
      if (Array.isArray(serCatJson)) setSeriesCategories(serCatJson);

      setLoadStatus("Downloading Channels..."); setLoadProgress(50);
      const streamRes = await fetch(`${xcUrl}/player_api.php?username=${xcUser}&password=${xcPass}&action=get_live_streams`, { signal });
      const streamJson = await streamRes.json();
      
      fetch(`${xcUrl}/player_api.php?username=${xcUser}&password=${xcPass}&action=get_vod_streams`, { signal })
        .then(r => r.json()).then(d => {
           const movies = d.map(m => ({ ...m, stream: `${xcUrl}/movie/${xcUser}/${xcPass}/${m.stream_id}.${m.container_extension}` }));
           setVodMovies(movies);
           setVodContinueMovies(movies.slice(0, 5)); 
           setVodWatchlistMovies(movies.slice(5, 10)); 
        }).catch(() => {});

      fetch(`${xcUrl}/player_api.php?username=${xcUser}&password=${xcPass}&action=get_series`, { signal })
        .then(r => r.json()).then(d => {
           setVodSeries(d);
           setVodContinueSeries(d.slice(0, 5)); 
           setVodWatchlistSeries(d.slice(5, 10));
        }).catch(() => {});
        
      if (streamJson && streamJson.length > 0) {
        setLoadStatus("Processing..."); setLoadProgress(80);
        const mappedChannels = streamJson.map(x => ({
          id: x.stream_id.toString(), num: x.num, name: x.name, logo: x.stream_icon,
          cat_id: x.category_id, tvg_id: x.epg_channel_id || x.stream_id, 
          cat_name: (catJson.find(c => c.category_id === x.category_id)?.category_name) || "General",
          stream: `${xcUrl}/live/${xcUser}/${xcPass}/${x.stream_id}.m3u8`,
          epg: [], epgLoaded: true 
        }));
        const sorted = mappedChannels.sort((a,b) => parseInt(a.num) - parseInt(b.num));
        setAllChannels(sorted);
        
        // SUCCESS: Clear loading, close modal immediately, and CLEAR TIMEOUT
        setLoadStatus("Ready"); setLoadProgress(100);
        setIsFirstLoad(false); 
        setIsSettingsOpen(false); 
        if(safetyTimeout.current) clearTimeout(safetyTimeout.current);
        
        const xmltvUrl = `${xcUrl}/xmltv.php?username=${xcUser}&password=${xcPass}`;
        DataService.fetchEPG(xmltvUrl, sorted, (updated) => setAllChannels(updated));
      } else { 
          setLoadStatus("No channels found");
          setIsFirstLoad(false); 
          setIsSettingsOpen(true);
      }
    } catch (e) { 
        if (e.name !== 'AbortError') { 
            setLoadStatus("Connection Failed"); 
            setIsFirstLoad(false);
            setIsSettingsOpen(true);
        }
    } finally { isFetchingRef.current = false; }
  };

  const executeSearch = (text) => setSearchQuery(text);
  const renderTimelineHeader = () => {
    const times = [];
    let t = viewStart;
    for (let i = 0; i < 8; i++) {
      const left = ((t - viewStart) / 60000) * PIXELS_PER_MIN;
      times.push(<View key={t} style={[styles.timeMarker, { left }]}><Text style={styles.timeText}>{TimeService.formatTime(t, settings.timeZone)}</Text></View>);
      t += 1800000;
    }
    return (
        <View style={styles.timelineContainer}>
            {times}
            {/* FULL HEIGHT "NOW" LINE - ABSOLUTE OVERLAY */}
            <View style={{ position: 'absolute', top: 0, bottom: -10000, left: ((currentTime - viewStart) / 60000) * PIXELS_PER_MIN, width: 2, backgroundColor: THEME.timelineNow, zIndex: 9999 }} />
            <Focusable style={styles.epgNavLeft} onPress={() => shiftTime(-30)}><Ionicons name="chevron-back" size={20} color="white" /></Focusable>
            <Focusable style={styles.epgNavRight} onPress={() => shiftTime(30)}><Ionicons name="chevron-forward" size={20} color="white" /></Focusable>
        </View>
    );
  };

  const renderChannelRow = useCallback(({ item }) => <ChannelRow item={item} isSelected={selectedChannel?.id === item.id} onSelect={onChannelSelect} onProgramSelect={onProgramSelect} viewStart={viewStart} currentTime={currentTime} userOffset={settings.timeZone} />, [selectedChannel?.id, viewStart, onProgramSelect, onChannelSelect, currentTime, settings.timeZone]);
  const renderGridItem = useCallback(({ item }) => <GridCard item={item} onSelect={handleGridSelect} width={(windowWidth - 60) / numColumns} />, [handleGridSelect, windowWidth, numColumns]);

  const RenderPreviewSection = () => (
    <View style={styles.splitHeader}>
       <ImageBackground source={{ uri: activePreviewItem?.image || 'https://via.placeholder.com/500' }} style={styles.previewPane} blurRadius={Platform.OS==='web'?10:3}>
          <LinearGradient colors={['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.9)']} style={StyleSheet.absoluteFill} />
          <View style={styles.previewContent}>
              <View style={styles.previewTopRow}>
                  <View style={styles.previewLogoBox}>
                     <Image source={{ uri: activePreviewItem?.logo || 'https://via.placeholder.com/50' }} style={{width: '80%', height: '80%'}} resizeMode="contain" />
                  </View>
                  <View style={styles.previewInfo}>
                      <Text style={styles.previewTitle} numberOfLines={2}>{activePreviewItem?.title || "Select a Program"}</Text>
                      <Text style={styles.previewTime}>{activePreviewItem?.time || ""}</Text>
                  </View>
              </View>
              {activePreviewItem?.desc && <Text style={styles.previewDesc} numberOfLines={3}>{activePreviewItem.desc}</Text>}
          </View>
       </ImageBackground>
       <TouchableOpacity style={[styles.videoPane, isFull && styles.videoPaneFull]} onPress={() => setIsFull(!isFull)} activeOpacity={1}>
          <Video source={{ uri: selectedChannel?.stream }} style={StyleSheet.absoluteFill} resizeMode={ResizeMode.CONTAIN} shouldPlay isLooping useNativeControls={false} />
          {!isFull && <View style={styles.liveBadge}><Text style={{color:'white', fontWeight:'bold', fontSize:10}}>LIVE</Text></View>}
          {isFull && <TouchableOpacity style={styles.fsClose} onPress={() => setIsFull(false)}><Ionicons name="contract" color="white" size={30} /></TouchableOpacity>}
       </TouchableOpacity>
    </View>
  );

  const renderVodScreen = (type) => {
      const categories = type === 'Movies' ? movieCategories : seriesCategories;
      const data = type === 'Movies' ? vodMovies : vodSeries;
      const themeColor = type === 'Movies' ? THEME.colMovie : THEME.colShow;

      const VodNav = () => (
          <View style={styles.capsuleContainer}>
              <Focusable style={styles.iconButton} onPress={() => setIsSearchActive(!isSearchActive)}><Ionicons name="search" size={20} color="white" /></Focusable>
              <View style={styles.vertDivider} />
              <Focusable style={styles.iconButton} onPress={handleBack}><Ionicons name="arrow-back" size={20} color="white" /></Focusable>
              {!isSearchActive ? (
                  <View style={[styles.pill, { backgroundColor: type === 'Movies' ? THEME.navColorMovies : THEME.navColorShows, marginLeft: 10 }]}>
                      <Text style={[styles.pillText, { color: 'white' }]}>{type}</Text>
                  </View>
              ) : <TextInput style={styles.searchInput} placeholder={`Search ${type}...`} placeholderTextColor="#888" autoFocus value={searchQuery} onChangeText={executeSearch} />}
              {isSearchActive && <Focusable style={styles.iconButton} onPress={() => { setIsSearchActive(false); setSearchQuery(''); }}><Ionicons name="close" size={20} color="white" /></Focusable>}
          </View>
      );
      
      if (isSearchActive) {
          return (
              <View style={{flex: 1}}>
                  <HeaderComp><VodNav /></HeaderComp>
                  {renderSearchResults()}
              </View>
          );
      }

      if (vodCategory === 'all') {
          return (
              <View style={{flex: 1}}>
                  <HeaderComp><VodNav /></HeaderComp>
                  <View style={{flex: 1, flexDirection: 'row'}}>
                      <View style={{paddingLeft: 0, paddingTop: 10, height: '100%'}}>
                          <View style={styles.vodSidebar}>
                              <ScrollView showsVerticalScrollIndicator={false}>
                                  <VodSidebarItem label={`All ${type}`} active={true} activeColor={themeColor} onPress={() => {}} />
                                  <VodSidebarItem label="Continue Watching" active={false} activeColor={themeColor} onPress={() => setVodCategory('continue')} />
                                  <VodSidebarItem label="Watchlist" active={false} activeColor={themeColor} onPress={() => setVodCategory('watchlist')} />
                                  {categories.map(c => <VodSidebarItem key={c.category_id} label={c.category_name} active={false} activeColor={themeColor} onPress={() => setVodCategory(c.category_id)} />)}
                              </ScrollView>
                          </View>
                      </View>
                      <ScrollView style={{flex: 1}} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 150 }}>
                          <VodRow title="Continue Watching" data={getFilteredVOD(type, 'continue')} onPress={setPlayingItem} />
                          <VodRow title="Watchlist" data={getFilteredVOD(type, 'watchlist')} onPress={setPlayingItem} />
                          {categories.map(cat => {
                              const catItems = data.filter(i => i.category_id === cat.category_id).slice(0, 10);
                              if (catItems.length === 0) return null;
                              return <VodRow key={cat.category_id} title={cat.category_name} data={catItems} onPress={setPlayingItem} />;
                          })}
                      </ScrollView>
                  </View>
              </View>
          );
      }

      const filtered = getFilteredVOD(type, vodCategory);
      return (
          <View style={{flex: 1}}>
              <HeaderComp><VodNav /></HeaderComp>
              <View style={{flex: 1, flexDirection: 'row'}}>
                  <View style={{paddingLeft: 0, paddingTop: 10, height: '100%'}}>
                      <View style={styles.vodSidebar}>
                          <ScrollView showsVerticalScrollIndicator={false}>
                              <VodSidebarItem label={`All ${type}`} active={false} activeColor={themeColor} onPress={() => setVodCategory('all')} />
                              <VodSidebarItem label="Continue Watching" active={vodCategory === 'continue'} activeColor={themeColor} onPress={() => setVodCategory('continue')} />
                              <VodSidebarItem label="Watchlist" active={vodCategory === 'watchlist'} activeColor={themeColor} onPress={() => setVodCategory('watchlist')} />
                              {categories.map(c => <VodSidebarItem key={c.category_id} label={c.category_name} active={vodCategory === c.category_id} activeColor={themeColor} onPress={() => setVodCategory(c.category_id)} />)}
                          </ScrollView>
                      </View>
                  </View>
                  <FlatList
                      data={filtered}
                      keyExtractor={(item) => item.stream_id || item.series_id}
                      numColumns={vodColumns}
                      renderItem={({ item }) => <VodCard item={item} onPress={setPlayingItem} />}
                      contentContainerStyle={{ padding: 20, paddingBottom: 150 }}
                      showsVerticalScrollIndicator={false}
                  />
              </View>
          </View>
      );
  };

  if (isFirstLoad) return <LoadingScreen progress={loadProgress} status={loadStatus} />;
  const dateStr = TimeService.formatDate(currentTime, settings.timeZone);
  const timeStr = TimeService.formatTime(currentTime, settings.timeZone);

  const HeaderComp = ({ children }) => (
    <View style={styles.header}>
        <View style={{flex: 1, flexDirection: 'row', alignItems: 'center'}}>{children}</View>
        <Focusable style={styles.clockPill} onPress={() => setIsSettingsOpen(true)}>
            <Text style={styles.clockText}>{timeStr}</Text>
            <Text style={styles.clockDate}>{dateStr}</Text>
        </Focusable>
    </View>
  );

  return (
    <View style={styles.container}>
      <LinearGradient colors={getGradientColors()} style={StyleSheet.absoluteFill} />
      <StatusBar hidden />
      
      {currentTab === 'home' && (
        <View style={{flex: 1}}>
            <HeaderComp><GlobalNavigation /></HeaderComp>
            {!isSearchActive && !isFull && <View style={{height: 300, marginBottom: 10}}><RenderPreviewSection /></View>}
            {isFull && <View style={{flex:1}}><RenderPreviewSection /></View>}
            {!isFull && !isSearchActive && (
                <ScrollView style={styles.scrollContainer} contentContainerStyle={{paddingBottom: 50, paddingTop: 10}} showsVerticalScrollIndicator={false}>
                    {getContinueWatchingData('Home').length > 0 && <ContentRow title="Continue Watching" data={getContinueWatchingData('Home')} type="mixed" onPress={(item) => item.stream_id || item.series_id ? setPlayingItem(item) : onChannelSelect(item)} />}
                    {settings.visibleTabs.movies && vodMovies.length > 0 && <ContentRow title="Latest Movies" data={vodMovies.slice(0,10)} type="poster" onPress={(item) => setPlayingItem(item)} />}
                </ScrollView>
            )}
            {isSearchActive && renderSearchResults()}
        </View>
      )}

      {currentTab === 'live' && (
        <View style={{ flex: 1 }}>
          <HeaderComp><CategoryNavigation /></HeaderComp>
          {!isSearchActive && <RenderPreviewSection />}
          {!isFull && (
            <View style={styles.epgContainer}>
              {isSearchActive ? renderSearchResults() : activeCategory === CAT_MAIN_EXTRA ? (
                 <ScrollView key="extra_view" style={{flex:1}} contentContainerStyle={{paddingBottom: 50}} showsVerticalScrollIndicator={false}>
                    {getAlphaSortedGroups.map((group) => <ContentRow key={group.title} title={group.title} data={group.data} type="square" onPress={handleGridSelect} />)}
                    {getAlphaSortedGroups.length === 0 && <View style={styles.center}><Text style={{color:'#666', marginTop:50}}>No Extra Content Found</Text></View>}
                 </ScrollView>
              ) : activeCategory === CAT_SPORTS_EXTRA ? (
                 <FlatList key="sports_extra_view" data={filteredChannels} keyExtractor={item => item.id} numColumns={numColumns} contentContainerStyle={{padding: 20}} renderItem={renderGridItem} ListEmptyComponent={<View style={styles.center}><Text style={{color:'#666', marginTop:50}}>No Sports Extra Content Found</Text></View>} showsVerticalScrollIndicator={false} />
              ) : (
                 <>
                   {/* EPG NOW LINE IS ABSOLUTE CHILD OF THIS CONTAINER IN renderTimelineHeader */}
                   <View style={styles.epgHeader}><View style={styles.cornerBox} /><View style={styles.timelineBox}>{renderTimelineHeader()}</View></View>
                   <FlatList ref={listRef} data={filteredChannels} keyExtractor={item => item.id} initialNumToRender={8} maxToRenderPerBatch={5} windowSize={3} removeClippedSubviews={true} getItemLayout={(data, index) => ({length: ROW_HEIGHT, offset: ROW_HEIGHT * index, index})} renderItem={renderChannelRow} onScrollToIndexFailed={onScrollToIndexFailed} showsVerticalScrollIndicator={false} />
                 </>
              )}
            </View>
          )}
        </View>
      )}

      {currentTab === 'movies' && renderVodScreen('Movies')}
      {currentTab === 'tvshows' && renderVodScreen('TV Shows')}

      {currentTab === 'recordings' && <View style={{flex: 1}}><HeaderComp><GlobalNavigation /></HeaderComp><View style={styles.center}><Text style={{color:'white'}}>Recordings Screen</Text></View></View>}

      <StreamSelectionModal visible={!!selectedGroup} group={selectedGroup} onClose={() => setSelectedGroup(null)} onSelect={(item) => { setSelectedChannel(item); AsyncStorage.setItem('lastWatchedChannelId', item.id); setSelectedGroup(null); }} />
      <PlayerModal visible={!!playingItem} item={playingItem} onClose={() => setPlayingItem(null)} />
      <SettingsModal visible={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} settings={settings} onSave={saveSettings} />
    </View>
  );
  
  function GlobalNavigation() {
      return (
        <View style={styles.capsuleContainer}>
            <Focusable style={styles.iconButton} onPress={() => setIsSearchActive(!isSearchActive)}><Ionicons name="search" size={20} color="white" /></Focusable>
            {!isSearchActive ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.capsuleScroll}>
                    <NavItem label="Home" active={currentTab === 'home'} type="global" onPress={() => setCurrentTab('home')} />
                    {settings.visibleTabs.live && <NavItem label="Live" active={currentTab === 'live'} type="global" colorOverride={THEME.navColorLive} onPress={switchToLive} />}
                    {settings.visibleTabs.recordings && <NavItem label="Recordings" active={currentTab === 'recordings'} type="global" colorOverride={THEME.navColorRec} onPress={() => setCurrentTab('recordings')} />}
                    {settings.visibleTabs.series && <NavItem label="TV Shows" active={currentTab === 'tvshows'} type="global" colorOverride={THEME.navColorShows} onPress={() => switchToVod('tvshows')} />}
                    {settings.visibleTabs.movies && <NavItem label="Movies" active={currentTab === 'movies'} type="global" colorOverride={THEME.navColorMovies} onPress={() => switchToVod('movies')} />}
                    {settings.visibleTabs.youtube && <NavItem label="YouTube" active={false} type="global" colorOverride={THEME.navColorYoutube} onPress={() => {}} />}
                    {settings.visibleTabs.music && <NavItem label="Music" active={false} type="global" colorOverride={THEME.navColorMusic} onPress={() => {}} />}
                </ScrollView>
            ) : <TextInput style={styles.searchInput} placeholder="Search..." placeholderTextColor="#888" autoFocus value={searchQuery} onChangeText={executeSearch} />}
            {isSearchActive && <Focusable style={styles.iconButton} onPress={() => { setIsSearchActive(false); setSearchQuery(''); }}><Ionicons name="close" size={20} color="white" /></Focusable>}
        </View>
      );
  }

  function CategoryNavigation() {
      const PRESCRIBED_ORDER = ['All Channels', 'Favourites', 'Entertainment', 'Documentaries', '+1', 'Movies', 'Music', 'Sports', 'News', 'Kids', 'Extra'];
      return (
        <View style={styles.capsuleContainer}>
            <Focusable style={styles.iconButton} onPress={() => setIsSearchActive(!isSearchActive)}><Ionicons name="search" size={20} color="white" /></Focusable>
            <View style={styles.vertDivider} />
            <Focusable style={styles.iconButton} onPress={handleBack}><Ionicons name="arrow-back" size={20} color="white" /></Focusable>
            {!isSearchActive ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.capsuleScroll}>
                    {navMode === 'sports' ? (
                        <>
                            <NavItem label="All Sports" active={activeCategory === CAT_ALL_SPORTS} onPress={() => setActiveCategory(CAT_ALL_SPORTS)} />
                            <NavItem label="Sports" active={activeCategory === CAT_SPORTS} onPress={() => setActiveCategory(CAT_SPORTS)} />
                            <NavItem label="Extra" active={activeCategory === CAT_SPORTS_EXTRA} onPress={() => setActiveCategory(CAT_SPORTS_EXTRA)} />
                        </>
                    ) : (
                        PRESCRIBED_ORDER.map((cat, i) => {
                            const isActive = activeCategory === (cat === 'Extra' ? CAT_MAIN_EXTRA : cat);
                            return <NavItem key={i} label={cat} active={isActive} onPress={() => handleNavClick(cat === 'Extra' ? CAT_MAIN_EXTRA : cat)} />;
                        })
                    )}
                </ScrollView>
            ) : <TextInput style={styles.searchInput} placeholder="Search channels..." placeholderTextColor="#888" autoFocus value={searchQuery} onChangeText={executeSearch} />}
            {isSearchActive && <Focusable style={styles.iconButton} onPress={() => { setIsSearchActive(false); setSearchQuery(''); }}><Ionicons name="close" size={20} color="white" /></Focusable>}
        </View>
      );
  }
  
  function renderSearchResults() {
      if (!searchQuery) return <View style={styles.center}><Text style={{color: THEME.textSecondary}}>Start typing...</Text></View>;
      const lower = searchQuery.toLowerCase();
      
      const matchedMovies = settings.visibleTabs.movies ? vodMovies.filter(m => m.name?.toLowerCase().includes(lower)) : [];
      const matchedSeries = settings.visibleTabs.series ? vodSeries.filter(s => s.name?.toLowerCase().includes(lower)) : [];
      const matchedChannels = settings.visibleTabs.live ? allChannels.filter(c => c.name.toLowerCase().includes(lower)) : [];
      const matchedPrograms = [];
      if (settings.visibleTabs.live) {
          allChannels.forEach(channel => {
              if (channel.epg) {
                  channel.epg.forEach(prog => {
                      if (prog.end > Date.now() && prog.title.toLowerCase().includes(lower)) matchedPrograms.push({ program: prog, channel: channel });
                  });
              }
          });
          matchedPrograms.sort((a, b) => a.program.start - b.program.start);
      }

      const MovieResults = () => matchedMovies.length > 0 ? <VodRow title="Movies" data={matchedMovies} onPress={setPlayingItem} /> : null;
      const TVResults = () => matchedSeries.length > 0 ? <VodRow title="TV Shows" data={matchedSeries} onPress={setPlayingItem} /> : null;
      const LiveResults = () => (
          <>
            {matchedChannels.length > 0 && <ContentRow title="Channels" data={matchedChannels} type="square" onPress={(item) => handleSearchSelect(item, 'channel')} />}
            {matchedPrograms.length > 0 && (
                <View style={{ marginBottom: 25 }}>
                  <Text style={styles.rowTitle}>{`Programs`}</Text>
                  <FlatList horizontal data={matchedPrograms} keyExtractor={(item, index) => index.toString()} renderItem={({ item }) => <ProgramCard program={item.program} channel={item.channel} width={PROGRAM_CARD_WIDTH} onPress={() => handleSearchSelect(item, 'program')} systemOffset={0} timeZone={settings.timeZone} />} showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 40 }} />
                </View>
            )}
          </>
      );

      return (
          <ScrollView style={styles.searchResultsContainer} showsVerticalScrollIndicator={false}>
              {currentTab === 'movies' ? (
                  <>
                      <MovieResults />
                      <TVResults />
                      <LiveResults />
                  </>
              ) : currentTab === 'tvshows' ? (
                  <>
                      <TVResults />
                      <MovieResults />
                      <LiveResults />
                  </>
              ) : (
                  <>
                      <LiveResults />
                      <MovieResults />
                      <TVResults />
                  </>
              )}
              {matchedChannels.length === 0 && matchedPrograms.length === 0 && matchedMovies.length === 0 && matchedSeries.length === 0 && (
                  <View style={styles.center}><Text style={{color: THEME.textSecondary}}>No results found.</Text></View>
              )}
          </ScrollView>
      );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { height: 70, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 30, paddingTop: 10 },
  pill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginRight: 10 },
  pillText: { fontWeight: '700', fontFamily: THEME.font },
  globalNavItem: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 24, marginRight: 5, justifyContent: 'center' },
  globalNavItemActive: { backgroundColor: THEME.activePillBg },
  globalNavText: { fontWeight: '700', fontSize: 14, fontFamily: THEME.font },
  globalNavTextActive: { color: THEME.activePillText },
  clockPill: { alignItems: 'flex-end', justifyContent:'center', backgroundColor: '#1f2937', paddingHorizontal: 15, paddingVertical: 5, borderRadius: 20, borderWidth:1, borderColor: THEME.border },
  clockText: { color: 'white', fontWeight: '800', fontSize: 16, lineHeight: 18, fontFamily: THEME.font },
  clockDate: { color: '#9ca3af', fontWeight: '600', fontSize: 11, lineHeight: 12, fontFamily: THEME.font },
  scrollContainer: { flex: 1 },
  rowTitle: { color: 'white', fontSize: 20, fontWeight: '700', marginLeft: 40, marginBottom: 15, fontFamily: THEME.font },
  cardSquare: { width: SQUARE_CARD_SIZE, height: SQUARE_CARD_SIZE, borderRadius: 16, marginRight: 20, backgroundColor: '#1c1c1c', justifyContent: 'center', alignItems: 'center', padding: 5 },
  cardTitleUnder: { color: 'white', fontSize: 13, fontWeight: '700', textAlign: 'center', marginTop: 5, fontFamily: THEME.font },
  loadingContainer: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  loadingContent: { width: '50%', alignItems: 'center' },
  loadingTitle: { color: 'white', fontSize: 24, fontWeight: 'bold', marginBottom: 20, fontFamily: THEME.font },
  progressBarBg: { width: '100%', height: 6, backgroundColor: '#333', borderRadius: 3, overflow: 'hidden', marginBottom: 10 },
  progressBarFill: { height: '100%', backgroundColor: THEME.colLive },
  loadingStatus: { color: '#888', fontSize: 14, fontFamily: THEME.font },
  capsuleContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: THEME.navCapsuleBg, borderRadius: 30, padding: 5, borderColor: '#27272a', borderWidth: 1, marginVertical: 10, maxWidth: '90%' },
  capsuleScroll: { alignItems: 'center', paddingHorizontal: 10 },
  iconButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginHorizontal: 2 },
  vertDivider: { width: 1, height: 20, backgroundColor: 'rgba(255,255,255,0.2)', marginHorizontal: 5 },
  searchInput: { flex: 1, color: 'white', fontSize: 16, paddingHorizontal: 15, paddingVertical: 8, height: 40, fontFamily: THEME.font },
  searchResultsContainer: { flex: 1, paddingTop: 20 },
  // PROGRAM CARD STYLE (Restored Landscape)
  programCard: { marginRight: 20, backgroundColor: THEME.cardBg, borderRadius: 12, overflow: 'hidden' },
  programImageContainer: { width: 220, height: 124, position: 'relative' }, 
  programImage: { width: '100%', height: '100%' },
  programLogoContainer: { position: 'absolute', top: 5, left: 5, width: 30, height: 30, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 4, justifyContent: 'center', alignItems: 'center', padding: 2 },
  programLogo: { width: '100%', height: '100%' },
  programInfo: { padding: 8 },
  programTitle: { color: 'white', fontWeight: 'bold', fontSize: 14, fontFamily: THEME.font, textAlign: 'left', marginBottom: 2 }, 
  programTime: { color: THEME.textSecondary, fontSize: 11, marginTop: 2, fontFamily: THEME.font, textAlign: 'left' },
  programChannelName: { color: THEME.textSecondary, fontSize: 11, marginTop: 2, fontStyle: 'italic', fontFamily: THEME.font, textAlign: 'left' },
  
  splitHeader: { flexDirection: 'row', height: 300, padding: 20, gap: 20 },
  previewPane: { flex: 1, borderRadius: 16, overflow: 'hidden', justifyContent:'flex-end' },
  previewContent: { padding: 30, position:'absolute', top:0, left:0, width:'100%' },
  previewTopRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 15 },
  previewLogoBox: { width: 80, height: 80, backgroundColor: '#1c1c1c', borderRadius: 8, justifyContent:'center', alignItems:'center' },
  previewInfo: { marginLeft: 20, flex: 1, justifyContent:'center' },
  previewTitle: { color: 'white', fontSize: 32, fontWeight: '800', textShadowColor:'rgba(0,0,0,0.8)', textShadowRadius: 5, fontFamily: THEME.font },
  previewTime: { color: '#ccc', fontSize: 18, fontWeight: '600', marginTop: 5, fontFamily: THEME.font },
  previewDesc: { color: '#ddd', fontSize: 16, maxWidth: '90%', marginTop: 5, fontFamily: THEME.font },
  videoPane: { width: 500, height: '100%', aspectRatio: 16/9, borderRadius: 16, overflow: 'hidden', backgroundColor: 'black', borderWidth: 1, borderColor: '#333' },
  videoPaneFull: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 9999, borderRadius: 0 },
  liveBadge: { position: 'absolute', top: 15, right: 15, backgroundColor: 'red', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  fsClose: { position: 'absolute', top: 40, left: 40, padding: 10, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 10 },
  epgContainer: { flex: 1, backgroundColor: 'transparent' },
  epgHeader: { flexDirection: 'row', height: 40, backgroundColor: 'transparent', borderBottomWidth: 1, borderColor: THEME.border },
  cornerBox: { width: 320, borderRightWidth: 1, borderColor: THEME.border, backgroundColor: THEME.surface },
  timelineBox: { flex: 1, backgroundColor: 'transparent', overflow: 'hidden', flexDirection: 'row', alignItems: 'center' },
  timelineContainer: { flex: 1, position: 'relative', height: '100%' },
  timeMarker: { position: 'absolute', top: 0, bottom: 0, borderLeftWidth: 1, borderColor: THEME.border, paddingLeft: 8, justifyContent: 'center' },
  timeText: { color: THEME.textSecondary, fontWeight: '700', fontSize: 12, fontFamily: THEME.font },
  epgNavLeft: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 30, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', zIndex: 99 },
  epgNavRight: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 30, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', zIndex: 99 },
  row: { flexDirection: 'row', height: ROW_HEIGHT, borderBottomWidth: 1, borderColor: THEME.border },
  rowSelected: { backgroundColor: '#172554', borderColor: '#2563eb', borderWidth: 1 },
  rowSidebar: { width: 320, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, backgroundColor: THEME.surface, borderRightWidth: 1, borderColor: THEME.border, zIndex: 10 },
  rowNum: { color: '#6b7280', fontWeight: '800', width: 50, fontSize: 18, fontFamily: THEME.font },
  logoContainer: { width: 60, height: 40, backgroundColor: 'transparent', borderRadius: 4, padding: 2, marginRight: 15, justifyContent:'center', alignItems:'center' },
  rowLogo: { width: '100%', height: '100%' },
  rowName: { color: 'white', fontWeight: '700', fontSize: 16, flex: 1, fontFamily: THEME.font },
  progBlock: { position: 'absolute', height: '70%', top: '15%', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 6, padding: 10, justifyContent: 'center', borderLeftWidth: 2, borderColor: 'transparent', overflow: 'hidden' },
  progTitle: { color: 'white', fontWeight: '700', fontSize: 16, fontFamily: THEME.font }, 
  progTime: { color: '#9ca3af', fontSize: 13, marginTop: 2, fontFamily: THEME.font },
  gridCardWrapper: { margin: 10, alignItems: 'center' },
  gridCard: { width: '100%', aspectRatio: 1, backgroundColor: '#1c1c1c', borderRadius: 16, alignItems: 'center', justifyContent: 'center', padding: 10 },
  gridLogo: { width: '80%', height: '60%', resizeMode:'contain', marginBottom: 10 },
  gridNameUnder: { color: 'white', fontWeight: '700', textAlign: 'center', fontSize: 14, marginTop: 8, fontFamily: THEME.font },
  gridIconContainer: { position: 'relative', width: '100%', height: '70%', justifyContent:'center', alignItems:'center' },
  groupBadge: { position: 'absolute', top: -5, right: -5, backgroundColor: THEME.colLive, borderRadius: 10, width: 20, height: 20, justifyContent: 'center', alignItems: 'center' },
  groupBadgeText: { color: 'white', fontSize: 10, fontWeight: 'bold', fontFamily: THEME.font },
  cardWrapper: { width: SQUARE_CARD_SIZE, marginRight: 20 },
  streamOption: { flexDirection: 'row', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderColor: '#333' },
  streamOptionText: { color: 'white', marginLeft: 15, fontSize: 16, fontFamily: THEME.font },
  settingsOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' },
  settingsModal: { width: 500, backgroundColor: THEME.surface, borderRadius: 16, padding: 40, borderWidth: 1, borderColor: THEME.border },
  modalTitle: { color: 'white', fontSize: 24, fontWeight: '800', marginBottom: 20, fontFamily: THEME.font },
  label: { color: THEME.textSecondary, marginBottom: 8, fontWeight: '700', fontSize: 12, textTransform: 'uppercase', fontFamily: THEME.font },
  input: { backgroundColor: '#1f2937', color: 'white', padding: 15, borderRadius: 8, marginBottom: 20, fontSize: 16, borderWidth: 1, borderColor: THEME.border, fontFamily: THEME.font },
  btnSave: { backgroundColor: THEME.colLive, padding: 15, borderRadius: 8, alignItems: 'center' },
  btnText: { color: 'white', fontWeight: '800', fontFamily: THEME.font },
  btnClose: { alignSelf: 'center', marginTop: 15 },
  closePlayerBtn: { position: 'absolute', top: 40, right: 40, zIndex: 100, padding: 10, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20 },
  tzBtn: { width: 40, height: 40, backgroundColor: '#333', justifyContent: 'center', alignItems: 'center', borderRadius: 8 },
  vodSidebar: { width: 220, marginLeft: 30, borderRadius: 24, backgroundColor: THEME.surface, paddingTop: 10, overflow: 'hidden', maxHeight: '100%', flex: 1 }, 
  sidebarItem: { padding: 15, borderBottomWidth: 1, borderColor: 'rgba(255,255,255,0.05)', paddingVertical: 20 }, 
  sidebarText: { color: THEME.textSecondary, fontWeight: '600', fontFamily: THEME.font, fontSize: 16 },
  sidebarTextActive: { color: 'white', fontWeight: 'bold' },
  vodCard: { width: VOD_CARD_WIDTH, height: VOD_CARD_HEIGHT, marginHorizontal: 10, borderRadius: 8, backgroundColor: '#333', overflow: 'visible', marginBottom: 40 }, 
  vodImage: { width: '100%', height: '100%', borderRadius: 8 },
  vodHoverDetails: { position: 'absolute', top: VOD_CARD_HEIGHT + 10, left: 0, right: 0, alignItems: 'center', zIndex: 101 }, 
  vodTitle: { color: 'white', fontSize: 14, fontWeight: 'bold', fontFamily: THEME.font, textAlign: 'center', textShadowColor: 'black', textShadowRadius: 5 },
  vodMeta: { color: '#fbbf24', fontSize: 12, marginTop: 4, fontFamily: THEME.font },
  vodRowContainer: { marginBottom: 30 },
});
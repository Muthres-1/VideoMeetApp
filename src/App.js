import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import { Video, Mic, MicOff, VideoOff, Copy, Users, Phone } from 'lucide-react';
import './App.css';

const SOCKET_SERVER = 'http://localhost:5000';


export default function App() {
  const [socket, setSocket] = useState(null);
  const [meetingId, setMeetingId] = useState('');
  const [inputMeetingId, setInputMeetingId] = useState('');
  const [inMeeting, setInMeeting] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isAudioOn, setIsAudioOn] = useState(true);
  const [username, setUsername] = useState('');
  const [showNameInput, setShowNameInput] = useState(true);
  const [remoteUsers, setRemoteUsers] = useState(new Map());
  
  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const peerConnectionsRef = useRef(new Map());

  // WebRTC configuration
  const iceServers = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  };

  // Initialize socket connection
  useEffect(() => {
    const newSocket = io(SOCKET_SERVER);
    setSocket(newSocket);

    return () => newSocket.close();
  }, []);

  // Socket event listeners
  useEffect(() => {
    if (!socket) return;

    socket.on('user-joined', async ({ socketId, username }) => {
      console.log('User joined:', username);
      await createPeerConnection(socketId, username, true);
    });

    socket.on('existing-participants', async (participants) => {
      for (const participant of participants) {
        await createPeerConnection(participant.socketId, participant.username, false);
      }
    });

    socket.on('offer', async ({ offer, from }) => {
      const pc = peerConnectionsRef.current.get(from);
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('answer', { answer, to: from });
      }
    });

    socket.on('answer', async ({ answer, from }) => {
      const pc = peerConnectionsRef.current.get(from);
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      }
    });

    socket.on('ice-candidate', async ({ candidate, from }) => {
      const pc = peerConnectionsRef.current.get(from);
      if (pc && candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
    });

    socket.on('user-left', (socketId) => {
      console.log('User left:', socketId);
      const pc = peerConnectionsRef.current.get(socketId);
      if (pc) {
        pc.close();
        peerConnectionsRef.current.delete(socketId);
      }
      setRemoteUsers(prev => {
        const newMap = new Map(prev);
        newMap.delete(socketId);
        return newMap;
      });
    });

    return () => {
      socket.off('user-joined');
      socket.off('existing-participants');
      socket.off('offer');
      socket.off('answer');
      socket.off('ice-candidate');
      socket.off('user-left');
    };
  }, [socket]);

  // Create peer connection
  const createPeerConnection = async (socketId, remoteUsername, isInitiator) => {
    const pc = new RTCPeerConnection(iceServers);
    peerConnectionsRef.current.set(socketId, pc);

    // Add local stream to peer connection
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    // Handle incoming tracks
    pc.ontrack = (event) => {
      console.log('Received remote track from:', socketId);
      setRemoteUsers(prev => {
        const newMap = new Map(prev);
        newMap.set(socketId, {
          username: remoteUsername,
          stream: event.streams[0]
        });
        return newMap;
      });
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('ice-candidate', {
          candidate: event.candidate,
          to: socketId
        });
      }
    };

    // Create and send offer if initiator
    if (isInitiator) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('offer', { offer, to: socketId });
    }

    return pc;
  };

  // Start local video stream
  const startLocalStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error('Error accessing media devices:', err);
      alert('Please allow camera and microphone access');
    }
  };

  // Generate random meeting ID
  const generateMeetingId = () => {
    return Math.random().toString(36).substring(2, 11).toUpperCase();
  };

  // Create new meeting
  const createMeeting = async () => {
    if (!username.trim()) {
      alert('Please enter your name');
      return;
    }
    const newMeetingId = generateMeetingId();
    setMeetingId(newMeetingId);
    setInMeeting(true);
    setShowNameInput(false);
    await startLocalStream();
    socket.emit('join-room', { roomId: newMeetingId, username });
  };

  // Join existing meeting
  const joinMeeting = async () => {
    if (!username.trim()) {
      alert('Please enter your name');
      return;
    }
    if (!inputMeetingId.trim()) {
      alert('Please enter a meeting ID');
      return;
    }
    setMeetingId(inputMeetingId);
    setInMeeting(true);
    setShowNameInput(false);
    await startLocalStream();
    socket.emit('join-room', { roomId: inputMeetingId, username });
  };

  // Leave meeting
  const leaveMeeting = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
    }
    
    peerConnectionsRef.current.forEach(pc => pc.close());
    peerConnectionsRef.current.clear();
    
    setInMeeting(false);
    setMeetingId('');
    setInputMeetingId('');
    setRemoteUsers(new Map());
    setShowNameInput(true);
  };

  // Toggle video
  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOn(videoTrack.enabled);
      }
    }
  };

  // Toggle audio
  const toggleAudio = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioOn(audioTrack.enabled);
      }
    }
  };

  // Copy meeting ID
  const copyMeetingId = () => {
    navigator.clipboard.writeText(meetingId);
    alert('Meeting ID copied to clipboard!');
  };

  if (showNameInput) {
    return (
      <div className="app-container">
        <div className="login-card">
          <h1 className="app-title">Video Meeting</h1>
          
          <input
            type="text"
            placeholder="Enter your name"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="input-field"
          />

          <button onClick={createMeeting} className="btn btn-primary">
            Create New Meeting
          </button>

          <div className="divider">
            <span>OR</span>
          </div>

          <input
            type="text"
            placeholder="Enter Meeting ID"
            value={inputMeetingId}
            onChange={(e) => setInputMeetingId(e.target.value)}
            className="input-field"
          />

          <button onClick={joinMeeting} className="btn btn-success">
            Join Meeting
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="meeting-container">
      <div className="meeting-header">
        <div className="meeting-info">
          <h2>Meeting ID: {meetingId}</h2>
          <button onClick={copyMeetingId} className="copy-btn">
            <Copy size={16} />
            Copy ID
          </button>
        </div>
        <div className="participants-count">
          <Users size={20} />
          <span>{remoteUsers.size + 1} participants</span>
        </div>
      </div>

      <div className="video-grid">
        <div className="video-container">
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className="video-element"
          />
          {!isVideoOn && (
            <div className="video-placeholder">
              <div className="avatar">{username.charAt(0).toUpperCase()}</div>
              <p>{username} (You)</p>
            </div>
          )}
          <div className="video-label">{username} (You)</div>
        </div>

        {Array.from(remoteUsers.entries()).map(([socketId, user]) => (
          <RemoteVideo key={socketId} user={user} />
        ))}
      </div>

      <div className="controls">
        <button
          onClick={toggleAudio}
          className={`control-btn ${!isAudioOn ? 'btn-danger' : ''}`}
        >
          {isAudioOn ? <Mic size={24} /> : <MicOff size={24} />}
        </button>

        <button
          onClick={toggleVideo}
          className={`control-btn ${!isVideoOn ? 'btn-danger' : ''}`}
        >
          {isVideoOn ? <Video size={24} /> : <VideoOff size={24} />}
        </button>

        <button onClick={leaveMeeting} className="control-btn btn-danger">
          <Phone className="phone-icon" size={24} />
        </button>
      </div>
    </div>
  );
}

function RemoteVideo({ user }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && user.stream) {
      videoRef.current.srcObject = user.stream;
    }
  }, [user.stream]);

  return (
    <div className="video-container">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="video-element"
      />
      <div className="video-label">{user.username}</div>
    </div>
  );
}
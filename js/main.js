'use strict';

var isChannelReady = false;
var isServer = false;
var isStarted = false;
var localStream;
var pc;
var remoteStream;
var turnReady;
var pdStream;
var chunks = [];
var mediaRecorder;

var pcConfig = {
    'iceServers': [{
        'urls': 'stun:stun.l.google.com:19302'
    }]
};

// Set up audio and video regardless of what devices are present.
var sdpConstraints = {
    offerToReceiveAudio: true,
    offerToReceiveVideo: true
};

var localVideo = document.querySelector('#senderVideo');
var remoteVideo = document.querySelector('#receiverVideo');

/////////////////////////////////////////////

var room = 'foo';
// Could prompt for room name:
// room = prompt('Enter room name:');

var socket = io.connect();

if (room !== '') {
    socket.emit('create or join', room);
    console.log('Attempted to create or join room', room);
}

socket.on('created', function(room) {
    console.log('Created room ' + room);
    isServer = true;
    document.getElementById('whoami').innerHTML = 'server';
    var elem = document.getElementById('senderVideo');
    elem.parentNode.removeChild(elem);
});

socket.on('full', function(room) {
    console.log('Room ' + room + ' is full');
});

socket.on('join', function (room){
    console.log('Another peer made a request to join room ' + room);
    console.log('This peer is the initiator of room ' + room + '!');
    isChannelReady = true;
});

socket.on('joined', function(room) {
    console.log('joined: ' + room);
    isChannelReady = true;
    if (!isServer) {
        document.getElementById('whoami').innerHTML = "client";
    }
});

socket.on('log', function(array) {
    console.log.apply(console, array);
});

////////////////////////////////////////////////

// Server must join room first. Then client connects, and sends server video.
// should only send if !isServer

// Sender side:
// after a 'successful call', pdStream will no longer be undefined

// serv
function maybeCreateStream() {
    if (!isChannelReady) {
        return;
    }
    if (pdStream) {
        return;
    }
    if (isServer) {
        return;
    }
    if (localVideo.captureStream) {
        pdStream = localVideo.captureStream();
        console.log('Captured stream from leftVideo with captureStream',
            pdStream);
        localVideo.play();
        maybeStart();
    } else if (localVideo.mozCaptureStream) {
        pdStream = localVideo.mozCaptureStream();
        console.log('Captured stream from leftVideo with mozCaptureStream()',
            pdStream);
        localVideo.play();
        maybeStart();
    } else {
        console.log('captureStream() not supported');
    }
}

// Video tag capture must be set up after video tracks are enumerated.
localVideo.oncanplay = maybeCreateStream;
if (localVideo.readyState >= 3) { // HAVE_FUTURE_DATA
    // Video is already ready to play, call maybeCreateStream in case oncanplay
    // fired before we registered the event handler.
    maybeCreateStream();
}

////////////////////////////////////////////////

function sendMessage(message) {
    console.log('Client sending message: ', message);
    socket.emit('message', message);
}

// This client receives a message
socket.on('message', function(message) {
    console.log('Client received message:', message);
    if (message === 'got user media') {
        maybeStart();
    } else if (message.type === 'offer') {
        if (!isServer && !isStarted) {
            maybeStart();
        }
        pc.setRemoteDescription(new RTCSessionDescription(message));
        doAnswer();
    } else if (message.type === 'answer' && isStarted) {
        pc.setRemoteDescription(new RTCSessionDescription(message));
    } else if (message.type === 'candidate' && isStarted) {
        var candidate = new RTCIceCandidate({
            sdpMLineIndex: message.label,
            candidate: message.candidate
        });
        pc.addIceCandidate(candidate);
    } else if (message === 'bye' && isStarted) {
        handleRemoteHangup();
    }
});

socket.on('ready', function() {
    console.log('Ready');
    if (!isServer) {
        maybeCreateStream();
    }
    maybeStart();
});

////////////////////////////////////////////////////

// navigator.mediaDevices.getUserMedia({
//     audio: false,
//     video: true
// })
//     .then(gotStream)
//     .catch(function(e) {
//         alert('getUserMedia() error: ' + e.name);
//     });

// function gotStream(stream) {
//     console.log('Adding local stream.');
//     localStream = stream;
//     localVideo.srcObject = stream;
//     sendMessage('got user media');
//     if (isServer) {
//         maybeStart();
//     }
// }

// var constraints = {
//     video: true
// };
//
// console.log('Getting user media with constraints', constraints);

if (location.hostname !== 'localhost') {
    requestTurn(
        'https://computeengineondemand.appspot.com/turn?username=41784574&key=4080218913'
    );
}

function maybeStart() {
    console.log('>>>>>>> maybeStart() ', isStarted, pdStream, isChannelReady);

    // if you didn't initiate the room, you want to send b/c you're the client
    if (!isServer) {
        if (!isStarted && typeof pdStream !== 'undefined' && isChannelReady) {
            console.log('>>>>>> creating peer connection');
            createPeerConnection();
            isStarted = true;
            console.log('isServer', isServer);
            pc.addStream(pdStream);
            console.log('client calling');
            doCall();
        }
    } else {
        if (!isStarted && isChannelReady) {
            console.log('>>>>>> creating peer connection');
            createPeerConnection();
            isStarted = true
        }
    }
}

window.onbeforeunload = function() {
    sendMessage('bye');
};

function download() {
    const blob = new Blob(chunks, {type: 'video/mp4'});
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = 'test.mp4';
    document.body.appendChild(a);
    a.click();
}

function handleDataAvailable(event) {
    if (event.data && event.data.size > 0) {
        chunks.push(event.data);
    }
}

function handleStop(event) {
    console.log('Recorder stopped: ', event);
    download();
}

function startRecording() {
    var options = {mimeType: 'video/mp4'};
    chunks = [];
    try {
        mediaRecorder = new MediaRecorder(remoteStream, options);
    } catch (e0) {
        console.log('Unable to create MediaRecorder with options Object: ', e0);
    }
    console.log('Created MediaRecorder', mediaRecorder, 'with options', options);
    mediaRecorder.onstop = handleStop;
    mediaRecorder.ondataavailable = handleDataAvailable;
    mediaRecorder.start(5000)
}

/////////////////////////////////////////////////////////

function createPeerConnection() {
    try {
        pc = new RTCPeerConnection(null);
        pc.onicecandidate = handleIceCandidate;
        pc.onaddstream = handleRemoteStreamAdded;
        pc.onremovestream = handleRemoteStreamRemoved;
        console.log('Created RTCPeerConnnection');
    } catch (e) {
        console.log('Failed to create PeerConnection, exception: ' + e.message);
        alert('Cannot create RTCPeerConnection object.');
        return;
    }
}

function handleIceCandidate(event) {
    console.log('icecandidate event: ', event);
    if (event.candidate) {
        sendMessage({
            type: 'candidate',
            label: event.candidate.sdpMLineIndex,
            id: event.candidate.sdpMid,
            candidate: event.candidate.candidate
        });
    } else {
        console.log('End of candidates.');
    }
}

function handleCreateOfferError(event) {
    console.log('createOffer() error: ', event);
}

function doCall() {
    console.log('Sending offer to peer');
    // const videoTracks = pdStream.getVideoTracks();
    // videoTracks.forEach(track => pc.addTrack(track));
    // if (videoTracks.length > 0) {
    //     console.log(`Using video device: ${videoTracks[0].label}`);
    // }
    pc.createOffer(setLocalAndSendMessage, handleCreateOfferError);
}

function doAnswer() {
    console.log('Sending answer to peer.');
    pc.createAnswer().then(
        setLocalAndSendMessage,
        onCreateSessionDescriptionError
    );
}

function setLocalAndSendMessage(sessionDescription) {
    pc.setLocalDescription(sessionDescription);
    console.log('setLocalAndSendMessage sending message', sessionDescription);
    sendMessage(sessionDescription);
}

function onCreateSessionDescriptionError(error) {
    trace('Failed to create session description: ' + error.toString());
}

function requestTurn(turnURL) {
    var turnExists = false;
    for (var i in pcConfig.iceServers) {
        if (pcConfig.iceServers[i].urls.substr(0, 5) === 'turn:') {
            turnExists = true;
            turnReady = true;
            break;
        }
    }
    if (!turnExists) {
        console.log('Getting TURN server from ', turnURL);
        // No TURN server. Get one from computeengineondemand.appspot.com:
        var xhr = new XMLHttpRequest();
        xhr.onreadystatechange = function() {
            if (xhr.readyState === 4 && xhr.status === 200) {
                var turnServer = JSON.parse(xhr.responseText);
                console.log('Got TURN server: ', turnServer);
                pcConfig.iceServers.push({
                    'urls': 'turn:' + turnServer.username + '@' + turnServer.turn,
                    'credential': turnServer.password
                });
                turnReady = true;
            }
        };
        xhr.open('GET', turnURL, true);
        xhr.send();
    }
}

function handleRemoteStreamAdded(event) {
    if (isServer) {
        console.log('Remote stream added.');
        remoteStream = event.stream;
        remoteVideo.srcObject = remoteStream;
        startRecording();
    }
}

function handleRemoteStreamRemoved(event) {
    console.log('Remote stream removed. Event: ', event);
}

function hangup() {
    console.log('Hanging up.');
    stop();
    sendMessage('bye');
}

function handleRemoteHangup() {
    console.log('Session terminated.');
    stop();
    isServer = false;
}

function stop() {
    isStarted = false;
    pc.close();
    pc = null;
}
var webrtc = new SimpleWebRTC({
  // the id/element dom element that will hold "our" video
  localVideoEl: 'localVideo',
  // the id/element dom element that will hold remote videos
  remoteVideosEl: 'remoteVideos',
  // immediately ask for camera access
  autoRequestMedia: true,
  //url: "shielded-brushlands-2364.herokuapp.com"
  url: 'http://localhost:1234/?user_id=' + window.location.search.match(/user_id=(.)$/)[1]
});

// we have to wait until it's ready
webrtc.on('readyToCall', function () {
    // you can name it anything
    webrtc.joinRoom('test-room');
});

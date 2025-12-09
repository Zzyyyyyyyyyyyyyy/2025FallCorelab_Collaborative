# Overview

In this assignment you’ll use Node.js and WebSockets to create a real time collaborative application. Your users should be able to do something collaborative together such as: 

- Drawing on a shared canvas.
- Moving items or shapes around a board.
- Editing a shared text box or simple document.

# Creative Considerations

- What does it mean to collaborate? How can your interface facilitate healthy collaboration?

# Phases

## Phase 1: Design & Setup

- Decide what kind of collaboration your app will support (drawing, moving shapes, editing text, etc.).
- Sketch how the interface should look and how two users will interact with it.

## Phase 2: Develop

- Set up a Node.js server to handle signaling between users.
- Build the WebSockets connection so two users can share actions in real time.
- Implement the shared interaction (canvas, board, or editor) and test that changes sync across both users.
- Add simple styling and indicators to make the collaboration clear.

# Requirements

- Real-Time Collaboration
    - Use WebSockets to connect two users in real-time.
    - Actions from one user should be immediately visible to the other.
- Node.js Server
    - Create a server with Node.js to handle signaling for the WebSockets connection.
- Shared State / Interaction
    - Actions from one user must update the other user’s view in real-time.
- Basic UI
    - Include a simple interface to display the shared content.
    - Show clear indicators of changes (e.g., cursor positions, drawing strokes).
- Two Users At Least
    - No authentication required — just connect via unique session URL or code.

参考代码：
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Moving Shape</title>
    <script src="https://cdn.jsdelivr.net/npm/p5@2.1.1/lib/p5.min.js"></script>
</head>
<body>
    <script>
        let circleX = 400; 
        let circleY = 400; 
        let dragging = false; 
        let offsetX, offsetY;
        function setup() {
            createCanvas(800,800)

        }
        function draw() {
            background(240); 
            fill(100, 150, 255); 
            noStroke(); 
            ellipse(circleX, circleY, 100, 100)    
            console.log(dragging)
        }

        function mousePressed() {
            const d = dist(mouseX, mouseY, circleX, circleY); 
            if (d < 50){
                dragging = true; 
                offsetX = circleX - mouseX; 
                offsetY = circleY - mouseY; 
            }

        }
        function mouseReleased() {
            dragging = false;

        }
         function mouseDragged() {
            if (dragging){
                circleX = mouseX + offsetX; 
                circleY = mouseY + offsetY; 
            }

         }
    </script>
</body>
</html>

2 <!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Shared Drawing using p5</title>
    <script src="
https://cdn.jsdelivr.net/npm/p5@2.1.0/lib/p5.min.js
"></script>

</head>
<body>
    <script>
        let ws; 
        let myColor; 

        function setup() {
            createCanvas(500, 400); 
            background(200);
            strokeWeight(3); 
            myColor = color(random(255), random(255), random(255));

            // establishing a new connection with the server 
            ws = new WebSocket('ws://149.31.224.105:3000'); 

            // telling the client what to do when it gets a message from the server
            ws.onmessage = (event) => {
                // code to draw 

                // saving the data that the server sends 
                const msg = JSON.parse(event.data);
                if(msg.type == 'draw'){
                    // drawing the line that the server just sent data about
                    stroke(msg.color); 
                    line(msg.px, msg.py, msg.x, msg.y)
                }
            }
        }

        function mouseDragged() {
            // setting up data to send to server 
            const data = {
                type: 'draw', 
                x: mouseX, 
                y: mouseY,
                px: pmouseX,
                py: pmouseY,
                color: myColor.toString()                  
            }
            // drawing line on screen where the mouse has been dragged
            line(pmouseX, pmouseY, mouseX, mouseY); 

            // sending data about where mouse was dragged to server
            ws.send(JSON.stringify(data)); 
        }
    </script>
</body>
</html>

3.// importing node modules 
const http = require('http');
const { WebSocketServer } = require('ws'); 

// creating an HTTP server
const server = http.createServer ((req, res) => {
  res.writeHead(200, {'Content-Type': 'text/plain'}); 
  res.end('Websocket server is running')  
})

// creating a WebSocker Server to allow "persistent connection"
const wss = new WebSocketServer({ server });

// telling the server what to do when it gets a new connection
wss.on('connection', (socket) => {
    console.log('Client connected'); 

    // telling the server what to do when it receives a new message on that connection
    socket.on('message', (data) => {
        console.log('Received: ', data.toString());

        // go through all of the clients 
        wss.clients.forEach((client) => {
        if( client != socket && client.readyState == client.OPEN){
            // send each client the message it just received 
            client.send(data.toString()); 
        }  
        })
    })
    // tell the server what we want it do when the client closes the connection   
    socket.on('close', () => {
        console.log("Client disconnected");
    })
})
// telling the server to listen on a specific port 
const PORT = 3000;
server.listen(PORT, ()=> {
    console.log(`Server is listening on http://localhost:${PORT}`)
})

4:
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Collect the Dot</title>
    <script src="https://cdn.jsdelivr.net/npm/p5@1.9.0/lib/p5.min.js"></script>
  </head>
  <body>
    <script>
      let ws;
      let playerId;
      let me = { x: 100, y: 100, score: 0 };
      let other = { x: 300, y: 100, score: 0 };
      let dot = { x: 200, y: 200 };

      function setup() {
        createCanvas(400, 300);
        textAlign(CENTER);
        textSize(16);

        playerId = Math.random().toString(36).slice(2);
       

        
      }

      function draw() {
        background(30);

        // Movement
        if (keyIsDown(LEFT_ARROW)) me.x -= 3;
        if (keyIsDown(RIGHT_ARROW)) me.x += 3;
        if (keyIsDown(UP_ARROW)) me.y -= 3;
        if (keyIsDown(DOWN_ARROW)) me.y += 3;

        // Constrain movement
        me.x = constrain(me.x, 0, width);
        me.y = constrain(me.y, 0, height);

        // Draw players
        fill(0, 200, 255);
        ellipse(me.x, me.y, 20);
        fill(255, 200, 0);
        ellipse(other.x, other.y, 20);

        // Draw the collectible dot
        fill(255, 0, 0);
        ellipse(dot.x, dot.y, 10);

        // Check for collection
        if (dist(me.x, me.y, dot.x, dot.y) < 15) {
          me.score++;
          dot.x = random(width);
          dot.y = random(height);
        }

        // Send my position + score
       

        // Show score
        fill(255);
        text(`You: ${me.score}  |  Opponent: ${other.score}`, width / 2, 20);
      }
    </script>
  </body>
</html>

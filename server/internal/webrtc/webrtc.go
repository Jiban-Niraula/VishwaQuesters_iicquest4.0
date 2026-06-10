package webrtc

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type SignalMessage struct {
	Type   string          `json:"type"`
	From   string          `json:"from"`
	Target string          `json:"target,omitempty"`
	Data   json.RawMessage `json:"data,omitempty"`
}

type Client struct {
	ID         string
	Conn       *websocket.Conn
	Role       string
	CameraType string
	Send       chan []byte
}

type Room struct {
	mu      sync.RWMutex
	Clients map[string]*Client
}

type Hub struct {
	mu    sync.RWMutex
	Rooms map[string]*Room
}

var GlobalHub = &Hub{
	Rooms: make(map[string]*Room),
}

func (h *Hub) GetOrCreateRoom(code string) *Room {
	h.mu.Lock()
	defer h.mu.Unlock()

	if room, ok := h.Rooms[code]; ok {
		return room
	}
	room := &Room{Clients: make(map[string]*Client)}
	h.Rooms[code] = room
	return room
}

func (r *Room) AddClient(client *Client) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.Clients[client.ID] = client
}

func (r *Room) RemoveClient(clientID string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.Clients, clientID)
}

func (r *Room) BroadcastToOthers(senderID string, message []byte) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	for id, client := range r.Clients {
		if id != senderID {
			select {
			case client.Send <- message:
			default:
				log.Printf("Client %s send channel full", id)
			}
		}
	}
}

func (r *Room) SendToClient(targetID string, message []byte) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	if client, exists := r.Clients[targetID]; exists {
		select {
		case client.Send <- message:
		default:
			log.Printf("Target client %s send channel full", targetID)
		}
	}
}

func HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	// Extract session code from URL
	sessionCode := r.URL.Query().Get("code")
	if sessionCode == "" {
		// Try to get from path /ws/:code
		path := r.URL.Path
		if len(path) > 4 {
			sessionCode = path[4:]
		}
	}

	if sessionCode == "" {
		log.Println("No session code provided")
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("WebSocket upgrade error:", err)
		return
	}

	room := GlobalHub.GetOrCreateRoom(sessionCode)

	// Variables to be initialized after join message
	var client *Client
	var clientID string

	// Channel to signal when client is initialized
	clientReady := make(chan struct{})

	// Start write pump AFTER client is initialized
	go func() {
		// Wait for client to be initialized
		<-clientReady
		if client == nil {
			return
		}
		for message := range client.Send {
			if err := conn.WriteMessage(websocket.TextMessage, message); err != nil {
				log.Println("Write error:", err)
				return
			}
		}
	}()

	// Cleanup function
	defer func() {
		if client != nil {
			room.RemoveClient(client.ID)
			close(client.Send)
			// Notify others
			leaveMsg, _ := json.Marshal(SignalMessage{
				Type: "client_left",
				From: client.ID,
				Data: json.RawMessage(`{"role":"` + client.Role + `"}`),
			})
			room.BroadcastToOthers(client.ID, leaveMsg)
		}
		conn.Close()
	}()

	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			log.Println("Read error:", err)
			break
		}

		var msg SignalMessage
		if err := json.Unmarshal(message, &msg); err != nil {
			log.Println("Unmarshal error:", err)
			continue
		}

		// Handle join message - this must be the first message
		if msg.Type == "join" {
			var joinData struct {
				RoomCode   string `json:"room_code"`
				Role       string `json:"role"`
				CameraType string `json:"camera_type"`
			}
			if err := json.Unmarshal(msg.Data, &joinData); err != nil {
				log.Println("Failed to parse join data:", err)
				continue
			}

			clientID = msg.From
			client = &Client{
				ID:         clientID,
				Conn:       conn,
				Role:       joinData.Role,
				CameraType: joinData.CameraType,
				Send:       make(chan []byte, 256),
			}
			room.AddClient(client)

			// Signal that client is ready
			close(clientReady)

			log.Printf("Client %s joined room %s as %s", client.ID, sessionCode, client.Role)

			// Notify others in the room
			joinNotify, _ := json.Marshal(SignalMessage{
				Type: "client_joined",
				From: client.ID,
				Data: json.RawMessage(`{"role":"` + client.Role + `","camera_type":"` + client.CameraType + `"}`),
			})
			room.BroadcastToOthers(client.ID, joinNotify)

			continue
		}

		// Only forward messages if client is initialized
		if client != nil && room != nil {
			// If message has a target, send only to that client
			if msg.Target != "" {
				room.SendToClient(msg.Target, message)
			} else {
				// Otherwise broadcast to all others
				room.BroadcastToOthers(client.ID, message)
			}
		}
	}
}

package webrtc

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"sync"

	"server/internal/models"
	"server/internal/services"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"gorm.io/gorm"
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

var GlobalHub = &Hub{Rooms: make(map[string]*Room)}

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

func (r *Room) CameraCount() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	count := 0
	for _, client := range r.Clients {
		if client.Role == "camera" {
			count++
		}
	}
	return count
}
func (r *Room) RoleCount(role string) int {
	r.mu.RLock()
	defer r.mu.RUnlock()

	count := 0
	for _, client := range r.Clients {
		if client.Role == role {
			count++
		}
	}
	return count
}

func CountViewers(roomCode string) int {
	GlobalHub.mu.RLock()
	room := GlobalHub.Rooms[roomCode]
	GlobalHub.mu.RUnlock()

	if room == nil {
		return 0
	}

	return room.RoleCount("viewer")
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

func HandleWebSocket(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		sessionCode := c.Query("code")
		if sessionCode == "" {
			sessionCode = c.Param("code")
		}
		sessionCode = strings.TrimSpace(sessionCode)
		if sessionCode == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "session code required"})
			return
		}

		var event models.Event
		if err := db.Where("code = ?", sessionCode).First(&event).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "event not found"})
			return
		}

		conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			log.Println("WebSocket upgrade error:", err)
			return
		}

		room := GlobalHub.GetOrCreateRoom(sessionCode)
		var client *Client
		clientReady := make(chan struct{})
		readyClosed := false

		go func() {
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

		defer func() {
			if !readyClosed {
				close(clientReady)
			}
			if client != nil {
				room.RemoveClient(client.ID)
				close(client.Send)
				if client.Role == "camera" && event.CameraCount > 0 {
					db.Model(&event).Update("camera_count", gorm.Expr("GREATEST(camera_count - 1, 0)"))
				}
				leaveMsg, _ := json.Marshal(SignalMessage{Type: "client_left", From: client.ID, Data: json.RawMessage(`{"role":"` + client.Role + `"}`)})
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

			if msg.Type == "join" {
				var joinData struct {
					RoomCode   string `json:"room_code"`
					Role       string `json:"role"`
					CameraType string `json:"camera_type"`
				}
				if err := json.Unmarshal(msg.Data, &joinData); err != nil {
					_ = conn.WriteJSON(gin.H{"type": "join_error", "error": "invalid join data"})
					continue
				}

				role := strings.TrimSpace(joinData.Role)
				if role == "camera" {
					plan := services.GetCreatorPlan(db, event.CreatorID)
					nextCameraCount := room.CameraCount() + 1
					if !services.CanConnectCamera(db, plan, nextCameraCount) {
						limit := services.MaxCamerasForPlan(db, plan)
						_ = conn.WriteJSON(gin.H{"type": "join_rejected", "reason": "camera_limit", "message": "Camera limit reached. Upgrade to Pro for unlimited cameras.", "plan": plan, "maxCameras": limit})
						return
					}
				}

				client = &Client{ID: msg.From, Conn: conn, Role: role, CameraType: joinData.CameraType, Send: make(chan []byte, 256)}
				room.AddClient(client)
				if role == "camera" {
					db.Model(&event).Update("camera_count", room.CameraCount())
				}
				close(clientReady)
				readyClosed = true

				log.Printf("Client %s joined room %s as %s", client.ID, sessionCode, client.Role)
				joinNotify, _ := json.Marshal(SignalMessage{Type: "client_joined", From: client.ID, Data: json.RawMessage(`{"role":"` + client.Role + `","camera_type":"` + client.CameraType + `"}`)})
				room.BroadcastToOthers(client.ID, joinNotify)
				continue
			}

			if client != nil && room != nil {
				if msg.Target != "" {
					room.SendToClient(msg.Target, message)
				} else {
					room.BroadcastToOthers(client.ID, message)
				}
			}
		}
	}
}

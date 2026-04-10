package main

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/gorilla/mux"
	"github.com/rs/cors"
)

const (
	TotalShards  = 10
	DataShards   = 6
	ParityShards = 4
)

type Shard struct {
	ID        int    `json:"id"`
	Data      []byte `json:"data"`
	Destroyed bool   `json:"destroyed"`
	SHA256    string `json:"sha256"`
}

type Database struct {
	mu           sync.RWMutex
	Shards       []*Shard  `json:"shards"`
	OriginalHash string    `json:"original_hash"`
	OriginalData []byte    `json:"-"`
	Encoded      [][]byte  `json:"-"`
	CreatedAt    time.Time `json:"created_at"`
	Status       string    `json:"status"`
	RecoveryLog  []string  `json:"recovery_log"`
}

var db = &Database{}

var gfLog [256]int
var gfExp [512]int

func gfInit() {
	x := 1
	for i := 0; i < 255; i++ {
		gfExp[i] = x
		gfLog[x] = i
		x <<= 1
		if x >= 256 {
			x ^= 0x11d
		}
	}
	for i := 255; i < 512; i++ {
		gfExp[i] = gfExp[i-255]
	}
}

func gfMul(a, b int) int {
	if a == 0 || b == 0 {
		return 0
	}
	return gfExp[(gfLog[a]+gfLog[b])%255]
}

func gfInv(a int) int {
	return gfExp[255-gfLog[a]]
}

func buildMatrix(dataShards, totalShards int) [][]int {
	m := make([][]int, totalShards)
	for i := range m {
		m[i] = make([]int, dataShards)
		for j := 0; j < dataShards; j++ {
			if i < dataShards {
				if i == j {
					m[i][j] = 1
				}
			} else {
				x := i - dataShards + 1
				m[i][j] = 1
				for k := 0; k < j; k++ {
					m[i][j] = gfMul(m[i][j], x)
				}
			}
		}
	}
	return m
}

func encodeData(data []byte, dShards, pShards int) [][]byte {
	total := dShards + pShards
	padLen := len(data)
	if padLen%dShards != 0 {
		padLen = (len(data)/dShards + 1) * dShards
	}
	padded := make([]byte, padLen)
	copy(padded, data)

	sz := padLen / dShards
	shards := make([][]byte, total)
	for i := range shards {
		shards[i] = make([]byte, sz)
	}
	for i := 0; i < dShards; i++ {
		copy(shards[i], padded[i*sz:(i+1)*sz])
	}

	mat := buildMatrix(dShards, total)
	for i := dShards; i < total; i++ {
		for j := 0; j < sz; j++ {
			val := 0
			for k := 0; k < dShards; k++ {
				val ^= gfMul(mat[i][k], int(shards[k][j]))
			}
			shards[i][j] = byte(val)
		}
	}
	return shards
}

func invertMatrix(matrix [][]int, n int) ([][]int, error) {
	aug := make([][]int, n)
	for i := range aug {
		aug[i] = make([]int, 2*n)
		copy(aug[i], matrix[i])
		aug[i][n+i] = 1
	}
	for col := 0; col < n; col++ {
		pivot := -1
		for row := col; row < n; row++ {
			if aug[row][col] != 0 {
				pivot = row
				break
			}
		}
		if pivot == -1 {
			return nil, fmt.Errorf("singular matrix at col %d", col)
		}
		aug[col], aug[pivot] = aug[pivot], aug[col]
		scale := gfInv(aug[col][col])
		for j := 0; j < 2*n; j++ {
			aug[col][j] = gfMul(aug[col][j], scale)
		}
		for row := 0; row < n; row++ {
			if row == col || aug[row][col] == 0 {
				continue
			}
			factor := aug[row][col]
			for j := 0; j < 2*n; j++ {
				aug[row][j] ^= gfMul(factor, aug[col][j])
			}
		}
	}
	result := make([][]int, n)
	for i := range result {
		result[i] = aug[i][n:]
	}
	return result, nil
}

func recoverData(shards [][]byte, destroyed []bool, dShards, pShards, origLen int) ([]byte, error) {
	total := dShards + pShards
	available := []int{}
	for i := 0; i < total; i++ {
		if !destroyed[i] {
			available = append(available, i)
		}
	}
	if len(available) < dShards {
		return nil, fmt.Errorf("need %d shards, only have %d", dShards, len(available))
	}

	chosen := available[:dShards]
	mat := buildMatrix(dShards, total)

	sub := make([][]int, dShards)
	subShards := make([][]byte, dShards)
	for i, idx := range chosen {
		sub[i] = mat[idx]
		subShards[i] = shards[idx]
	}

	inv, err := invertMatrix(sub, dShards)
	if err != nil {
		return nil, err
	}

	sz := len(shards[available[0]])
	out := make([][]byte, dShards)
	for i := range out {
		out[i] = make([]byte, sz)
	}
	for i := 0; i < dShards; i++ {
		for j := 0; j < sz; j++ {
			val := 0
			for k := 0; k < dShards; k++ {
				val ^= gfMul(inv[i][k], int(subShards[k][j]))
			}
			out[i][j] = byte(val)
		}
	}

	var result []byte
	for i := 0; i < dShards; i++ {
		result = append(result, out[i]...)
	}
	if len(result) < origLen {
		return nil, fmt.Errorf("recovered data too short: got %d need %d", len(result), origLen)
	}
	return result[:origLen], nil
}

func hashOf(data []byte) string {
	h := sha256.Sum256(data)
	return hex.EncodeToString(h[:])
}

func sanitize(shards []*Shard) []map[string]interface{} {
	out := make([]map[string]interface{}, len(shards))
	for i, s := range shards {
		out[i] = map[string]interface{}{
			"id":        s.ID,
			"destroyed": s.Destroyed,
			"sha256":    s.SHA256,
			"size":      len(s.Data),
		}
	}
	return out
}

func jsonOK(w http.ResponseWriter, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

func handleStatus(w http.ResponseWriter, r *http.Request) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	jsonOK(w, map[string]interface{}{
		"status":        db.Status,
		"total_shards":  TotalShards,
		"data_shards":   DataShards,
		"parity_shards": ParityShards,
		"threshold":     DataShards,
	})
}

func handleGenerate(w http.ResponseWriter, r *http.Request) {
	db.mu.Lock()
	defer db.mu.Unlock()

	rawData := make([]byte, 4096)
	if _, err := rand.Read(rawData); err != nil {
		http.Error(w, "failed to generate random data", 500)
		return
	}

	origHash := hashOf(rawData)
	encoded := encodeData(rawData, DataShards, ParityShards)

	shards := make([]*Shard, TotalShards)
	for i := 0; i < TotalShards; i++ {
		shards[i] = &Shard{
			ID:        i,
			Data:      encoded[i],
			Destroyed: false,
			SHA256:    hashOf(encoded[i]),
		}
	}

	db.Shards = shards
	db.OriginalHash = origHash
	db.OriginalData = rawData
	db.Encoded = encoded
	db.CreatedAt = time.Now()
	db.Status = "healthy"
	db.RecoveryLog = []string{}

	log.Printf("Generated DB hash=%s", origHash[:16])

	jsonOK(w, map[string]interface{}{
		"success":       true,
		"original_hash": origHash,
		"shard_count":   TotalShards,
		"data_size":     len(rawData),
		"shards":        sanitize(shards),
	})
}

func handleGetShards(w http.ResponseWriter, r *http.Request) {
	db.mu.RLock()
	defer db.mu.RUnlock()

	if db.Shards == nil {
		jsonOK(w, map[string]interface{}{"shards": []interface{}{}, "original_hash": "", "status": "idle"})
		return
	}
	jsonOK(w, map[string]interface{}{
		"shards":        sanitize(db.Shards),
		"original_hash": db.OriginalHash,
		"status":        db.Status,
		"created_at":    db.CreatedAt,
	})
}

type DestroyReq struct {
	ShardIDs []int `json:"shard_ids"`
	Force    bool  `json:"force"`
}

func handleDestroy(w http.ResponseWriter, r *http.Request) {
	var req DestroyReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), 400)
		return
	}
	db.mu.Lock()
	defer db.mu.Unlock()

	if db.Shards == nil {
		http.Error(w, "no database initialized", 400)
		return
	}

	alreadyDead := 0
	for _, s := range db.Shards {
		if s.Destroyed {
			alreadyDead++
		}
	}
	surviving := TotalShards - alreadyDead - len(req.ShardIDs)
	willDie := surviving < DataShards

	if willDie && !req.Force {
		jsonOK(w, map[string]interface{}{
			"warning":          true,
			"unrecoverable":    true,
			"surviving_shards": surviving,
			"threshold":        DataShards,
			"message": fmt.Sprintf(
				"WARNING: Destroying %d more shards will leave only %d shards, below the recovery threshold of %d. Data will be PERMANENTLY LOST.",
				len(req.ShardIDs), surviving, DataShards),
		})
		return
	}

	for _, id := range req.ShardIDs {
		if id >= 0 && id < TotalShards {
			db.Shards[id].Destroyed = true
			db.Shards[id].Data = nil
		}
	}

	active := 0
	for _, s := range db.Shards {
		if !s.Destroyed {
			active++
		}
	}
	if active < DataShards {
		db.Status = "unrecoverable"
	} else if active < TotalShards {
		db.Status = "degraded"
	}

	jsonOK(w, map[string]interface{}{
		"success":          true,
		"active_shards":    active,
		"destroyed_shards": TotalShards - active,
		"recoverable":      active >= DataShards,
		"status":           db.Status,
		"shards":           sanitize(db.Shards),
	})
}

func handleRecover(w http.ResponseWriter, r *http.Request) {
	db.mu.Lock()
	defer db.mu.Unlock()

	if db.Shards == nil {
		http.Error(w, "no database initialized", 400)
		return
	}

	rlog := []string{"🔍 Scanning shard availability..."}

	available := []int{}
	destroyed := make([]bool, TotalShards)
	shardData := make([][]byte, TotalShards)

	for i, s := range db.Shards {
		if s.Destroyed {
			destroyed[i] = true
			rlog = append(rlog, fmt.Sprintf("❌ Shard #%d: DESTROYED", i))
		} else {
			available = append(available, i)
			shardData[i] = s.Data
			rlog = append(rlog, fmt.Sprintf("✅ Shard #%d: OK (SHA256: %s...)", i, s.SHA256[:12]))
		}
	}

	rlog = append(rlog, fmt.Sprintf("📊 Available: %d/%d shards (threshold: %d)", len(available), TotalShards, DataShards))

	if len(available) < DataShards {
		rlog = append(rlog, fmt.Sprintf("💀 RECOVERY FAILED: need %d shards, only %d available", DataShards, len(available)))
		db.RecoveryLog = rlog
		jsonOK(w, map[string]interface{}{
			"success":  false,
			"log":      rlog,
			"error":    "Insufficient shards for recovery",
			"verified": false,
		})
		return
	}

	rlog = append(rlog, "🔧 Applying Reed-Solomon reconstruction...")

	recovered, err := recoverData(shardData, destroyed, DataShards, ParityShards, 4096)
	if err != nil {
		rlog = append(rlog, fmt.Sprintf("❌ Reconstruction error: %v", err))
		db.RecoveryLog = rlog
		jsonOK(w, map[string]interface{}{"success": false, "log": rlog, "error": err.Error()})
		return
	}

	rlog = append(rlog, "🔐 Verifying SHA256 checksum...")
	recoveredHash := hashOf(recovered)
	rlog = append(rlog, fmt.Sprintf("   Expected: %s", db.OriginalHash))
	rlog = append(rlog, fmt.Sprintf("   Computed: %s", recoveredHash))

	verified := recoveredHash == db.OriginalHash

	if verified {
		rlog = append(rlog, "✅ SHA256 VERIFIED — Data integrity confirmed!")
		rlog = append(rlog, "🎉 Recovery successful! All data restored.")
		encoded := encodeData(recovered, DataShards, ParityShards)
		for i := range db.Shards {
			if db.Shards[i].Destroyed {
				db.Shards[i].Destroyed = false
				db.Shards[i].Data = encoded[i]
				db.Shards[i].SHA256 = hashOf(encoded[i])
			}
		}
		db.Status = "healthy"
	} else {
		rlog = append(rlog, "❌ SHA256 MISMATCH — Data corruption detected!")
		db.Status = "unrecoverable"
	}

	db.RecoveryLog = rlog

	jsonOK(w, map[string]interface{}{
		"success":        verified,
		"verified":       verified,
		"log":            rlog,
		"original_hash":  db.OriginalHash,
		"recovered_hash": recoveredHash,
		"shards":         sanitize(db.Shards),
		"status":         db.Status,
	})
}

func main() {
	gfInit()
	log.Printf("🚀 Erasure Coding Demo — RS(%d,%d) GF(256)", TotalShards, DataShards)

	r := mux.NewRouter()
	r.HandleFunc("/api/status", handleStatus).Methods("GET", "OPTIONS")
	r.HandleFunc("/api/generate", handleGenerate).Methods("POST", "OPTIONS")
	r.HandleFunc("/api/shards", handleGetShards).Methods("GET", "OPTIONS")
	r.HandleFunc("/api/destroy", handleDestroy).Methods("POST", "OPTIONS")
	r.HandleFunc("/api/recover", handleRecover).Methods("POST", "OPTIONS")

	c := cors.New(cors.Options{
		AllowedOrigins: []string{"*"},
		AllowedMethods: []string{"GET", "POST", "OPTIONS"},
		AllowedHeaders: []string{"Content-Type"},
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("Listening on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, c.Handler(r)))
}

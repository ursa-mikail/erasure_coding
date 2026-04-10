FROM golang:1.21-alpine AS builder

WORKDIR /app

ENV GONOSUMDB=*
ENV GOFLAGS=-mod=mod

COPY go.mod ./
COPY . .

RUN go mod tidy && \
    CGO_ENABLED=0 GOOS=linux go build -o server .

FROM alpine:3.18
RUN apk --no-cache add ca-certificates tzdata
WORKDIR /root/
COPY --from=builder /app/server .
EXPOSE 8080
CMD ["./server"]

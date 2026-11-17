export const SAMPLE = `{
  "workspace": "Studio North",
  "environment": "production",
  "orders": [
    {
      "id": 9007199254740993,
      "customer": "Alice Chen",
      "status": "completed",
      "total": 248.50,
      "paid": true,
      "items": [
        { "sku": "KEY-001", "name": "Mechanical keyboard", "qty": 1 },
        { "sku": "PAD-002", "name": "Desk mat", "qty": 2 }
      ],
      "shipping": { "city": "Shanghai", "method": "express" },
      "note": null
    },
    {
      "id": 9007199254740994,
      "customer": "Noah Park",
      "status": "processing",
      "total": 89.90,
      "paid": true,
      "items": [
        { "sku": "HUB-003", "name": "USB-C hub", "qty": 1 }
      ],
      "shipping": { "city": "Seoul", "method": "standard" }
    },
    {
      "id": 9007199254740995,
      "customer": "Mia Wilson",
      "status": "pending",
      "total": 156.00,
      "paid": false,
      "items": [],
      "shipping": { "city": "London", "method": "standard" },
      "note": "Gift wrap"
    }
  ],
  "meta": { "count": 3, "currency": "USD", "tags": ["online", "retail"] }
}`;

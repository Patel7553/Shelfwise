"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function Dashboard() {
  const [products, setProducts] = useState<any[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    loadProducts();
  }, []);

  async function loadProducts() {
  const { data, error } = await supabase
    .from("products")
    .select("*");

    if (data) {
    setProducts(data);
  }
}

  const total = products.length;
    const expiringSoonProducts = products.filter(
    (p) =>
      p.expiry_date &&
      new Date(p.expiry_date) <
        new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  );

  const expiredProducts = products.filter(
    (p) =>
      p.expiry_date &&
      new Date(p.expiry_date) < new Date()
  );

  const expiringSoon = expiringSoonProducts.length;
  const expiredCount = expiredProducts.length;

  const criticalItems = products.filter(
    (p) => Number(p.quantity) <= 2
  ).length;

  const notifications = [];

if (expiredCount > 0) {
  notifications.push(
    `🚫 Expired Products: ${expiredCount}`
  );
}

if (expiringSoon > 0) {
  notifications.push(
    `⚠️ Expiring Soon: ${expiringSoon}`
  );
}

if (criticalItems > 0) {
  notifications.push(
    `🔴 Critical Stock: ${criticalItems}`
  );
}

  const lowStockItems = products.filter(
    (p) =>
      Number(p.quantity) > 2 &&
      Number(p.quantity) <= 5
  ).length;

  const dairyCount = products.filter(
  (p) =>
    p.category?.trim().toLowerCase() === "dairy"
).length;

const meatCount = products.filter(
  (p) =>
    p.category?.trim().toLowerCase() === "meat"
).length;

const dryProductsCount = products.filter(
  (p) =>
    p.category?.trim().toLowerCase() ===
    "dry products"
).length;

const frozenCount = products.filter(
  (p) =>
    p.category?.trim().toLowerCase() ===
    "frozen"
).length;

const saucesCount = products.filter(
  (p) =>
    p.category?.trim().toLowerCase() ===
    "sauces"
).length;

  const filteredProducts = products.filter((p) =>
    (p.name || "")
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const cardStyle = {
    background: "white",
    padding: "20px",
    borderRadius: "16px",
    boxShadow: "0 2px 10px rgba(0,0,0,0.08)",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f8f5ff",
        padding: "30px",
        fontFamily: "Arial",
      }}
    >
      <div
  style={{
    background: "white",
    borderRadius: "24px",
    padding: "20px",
    marginBottom: "20px",
    boxShadow: "0 4px 16px rgba(0,0,0,0.05)",
  }}
>
  <p
    style={{
      color: "#888",
      marginBottom: "10px",
      fontSize: "14px",
    }}
  >
    Good Morning 👋
  </p>

  <h1
    style={{
      fontSize: "42px",
      fontWeight: "800",
      color: "#111",
      marginBottom: "10px",
    }}
  >
    ShelfWise
  </h1>

  <p
    style={{
      color: "#666",
      fontSize: "18px",
    }}
  >
    Never miss an expiry again.
  </p>
</div>

      <div
        style={{
    background: "#fff",
    padding: "20px",
    borderRadius: "16px",
    marginBottom: "25px",
    border: "2px solid #e9d5ff",
  }}
>
  <h2
    style={{
      color: "#6d28d9",
      marginBottom: "12px",
    }}
  >
    Needs Attention
  </h2>

  {notifications.length === 0 ? (
    <p>✅ No alerts right now.</p>
  ) : (
    notifications.map((item, index) => (
      <p
        key={index}
        style={{
          fontWeight: "bold",
          marginBottom: "8px",
        }}
      >
        {item}
      </p>
    ))
  )}
</div>


      {/* MAIN STATS */}

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit,minmax(220px,1fr))",
          gap: "20px",
        }}
      >
        <a
  href="/inventory"
  style={{
    textDecoration: "none",
    color: "inherit",
  }}
>
  <div
  style={{
    ...cardStyle,
    background: "#F3F4FF",
    border: "1px solid #D8D9FF",
  }}
>
  <h3>📦 Total Products</h3>
  <h2>{total}</h2>
</div>
</a>

<a
  href="/inventory?status=Expiring Soon"
  style={{
    textDecoration: "none",
    color: "inherit",
  }}
>
  <div
  style={{
    ...cardStyle,
    background: "#FFF7E8",
    border: "1px solid #F5D7A1",
  }}
>
  <h3>⚠️ Expiring Soon</h3>
  <h2>{expiringSoon}</h2>
</div>
</a>

<a
  href="/inventory?status=Expired"
  style={{
    textDecoration: "none",
    color: "inherit",
  }}
>
  <div
  style={{
    ...cardStyle,
    background: "#FFECEC",
    border: "1px solid #FFB8B8",
  }}
>
  <h3>🚫 Expired Products</h3>
  <h2>{expiredCount}</h2>
</div>
</a>

<a
  href="/inventory?status=Critical"
  style={{
    textDecoration: "none",
    color: "inherit",
  }}
>
  <div
  style={{
    ...cardStyle,
    background: "#FFF0F0",
    border: "1px solid #FF9E9E",
  }}
>
  <h3>🔴 Critical Stock</h3>
  <h2>{criticalItems}</h2>
</div>
</a>

      </div>

      
      {/* BUTTONS */}

      <div
        style={{
          marginTop: "30px",
          display: "flex",
          gap: "10px",
        }}
      >
        <div
  style={{
    marginTop: "25px",
    marginBottom: "30px",
  }}
>
  <a
    href="/add"
    style={{
      display: "block",
      textAlign: "center",
      background: "#C69B5A",
      color: "white",
      padding: "18px",
      borderRadius: "18px",
      fontSize: "18px",
      fontWeight: "700",
      width: "100%",
      maxWidth: "350px",
      margin: "0 auto",
    }}
  >
    ➕ Add Product
  </a>
</div>
      </div>

      {/* SEARCH */}

      <div
        style={{
          background: "white",
          padding: "20px",
          borderRadius: "16px",
          marginTop: "30px",
        }}
      >
        <h3>🔍 Search Products</h3>

        <input
          type="text"
          placeholder="Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: "100%",
            padding: "12px",
            borderRadius: "10px",
            border: "1px solid #ddd",
          }}
        />
      </div>

      {/* RECENT PRODUCTS */}

      <h2 style={{ marginTop: "40px" }}>
        📋 Recent Products
      </h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fill,minmax(320px,1fr))",
          gap: "20px",
          marginTop: "15px",
        }}
      >
        {filteredProducts.map((p) => (
          <div
            key={p.id}
            style={{
              background: "white",
              borderRadius: "16px",
              padding: "15px",
              boxShadow:
                "0 2px 10px rgba(0,0,0,0.08)",
            }}
          >
            {p.image_url ? (
              <img
                src={`https://sabsvsolekdhztzqafuc.supabase.co/storage/v1/object/public/product-images/${p.image_url}`}
                alt={p.name}
                style={{
                  width: "100%",
                  height: "180px",
                  objectFit: "cover",
                  borderRadius: "12px",
                }}
              />
            ) : (
              <div
                style={{
                  height: "180px",
                  background: "#eee",
                  borderRadius: "12px",
                }}
              />
            )}

            <h3 style={{ marginTop: "12px" }}>
                {p.name}
            </h3>

            <p>
              {p.quantity} {p.unit}
            </p>

            <p>{p.category}</p>

            <p>
              {p.storage_type} / {p.shelf}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
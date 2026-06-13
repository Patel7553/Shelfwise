"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function Inventory() {
  const [products, setProducts] = useState<any[]>([]);
  

  const [search, setSearch] = useState("");

  const [category, setCategory] = useState("All");

   
  const searchParams = useSearchParams();
  
  const status = searchParams.get("status");
  const [statusFilter, setStatusFilter] = useState(
  status || "All"
);

  const [sortOrder, setSortOrder] = useState("nearest");


  const statusFilter = status;

  console.log("STATUS =", status);

  useEffect(() => {
    loadProducts();
  }, []);

  async function deleteProduct(id: number, name: string) {
  const confirmed = window.confirm(
    `Delete ${name}?`
  );

  if (!confirmed) return;

  const { error } = await supabase
    .from("products")
    .delete()
    .eq("id", id);

  if (error) {
    alert(error.message);
    return;
  }

  loadProducts();
}

  async function loadProducts() {
    const { data } = await supabase
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });

    if (data) {
      setProducts(data);
    }
  }
  

  function exportToCSV() {
    const headers = [
      "Name",
      "Quantity",
      "Unit",
      "Expiry Date",
      "Location",
      "Storage",
    ];

    const rows = products.map((p) => [
      p.name,
      p.quantity,
      p.unit,
      p.expiry_date,
      p.location,
      p.storage_type,
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");

    link.href = url;

    link.setAttribute(
      "download",
      `inventory-${new Date()
        .toISOString()
        .slice(0, 10)}.csv`
    );

    document.body.appendChild(link);

    link.click();

    document.body.removeChild(link);
  }

  function getExpiryStatus(expiryDate: string) {
    if (!expiryDate) {
      return {
        text: "No Date",
        color: "#6b7280",
      };
    }

    const expiry = new Date(expiryDate);
    const today = new Date();

    const daysLeft = Math.ceil(
      (expiry.getTime() - today.getTime()) /
      (1000 * 60 * 60 * 24)
    );

    if (daysLeft < 0) {
      return {
        text: "Expired",
        color: "#ef4444",
      };
    }

    if (daysLeft <= 7) {
      return {
        text: "Expiring Soon",
        color: "#f59e0b",
      };
    }

    return {
      text: "Safe",
      color: "#10b981",
    };
  }

  function getStockStatus(quantity: number) {
    if (quantity <= 2) {
      return {
        text: "Critical",
        color: "#ef4444",
      };
    }

    if (quantity <= 5) {
      return {
        text: "Low Stock",
        color: "#f59e0b",
      };
    }

    return {
      text: "In Stock",
      color: "#10b981",
    };
  }

  const totalProducts = products.length;

  const expiredProducts = products.filter((p) => {
    if (!p.expiry_date) return false;
    return new Date(p.expiry_date) < new Date();
  }).length;

  const expiringSoonProducts = products.filter((p) => {
    if (!p.expiry_date) return false;

    const expiry = new Date(p.expiry_date);
    const today = new Date();

    const daysLeft = Math.ceil(
      (expiry.getTime() - today.getTime()) /
      (1000 * 60 * 60 * 24)
    );

    return daysLeft >= 0 && daysLeft <= 7;
  }).length;

  const criticalProducts = products.filter(
    (p) => Number(p.quantity) <= 2
  ).length;

  let statusProducts = [...products];

if (status === "Expired") {
  statusProducts = statusProducts.filter(
    (p) =>
      p.expiry_date &&
      new Date(p.expiry_date) < new Date()
  );
}

if (status === "Critical") {
  statusProducts = statusProducts.filter(
    (p) => Number(p.quantity) <= 2
  );
}

if (status === "Expiring") {
  statusProducts = statusProducts.filter((p) => {
    if (!p.expiry_date) return false;

    const daysLeft = Math.ceil(
      (new Date(p.expiry_date).getTime() -
        Date.now()) /
        (1000 * 60 * 60 * 24)
    );

    return daysLeft >= 0 && daysLeft <= 7;
  });
}
  
  let filteredProducts = statusProducts.filter((p) => {
    const matchesSearch = p.name
      ?.toLowerCase()
      .includes(search.toLowerCase());

  const matchesCategory =
  category === "All" ||
  (p.category || "").toLowerCase() ===
    category.toLowerCase();

    let matchesStatus = true;

    const quantity = Number(p.quantity);

    const expiry = p.expiry_date
      ? new Date(p.expiry_date)
      : null;

    const today = new Date();

    const daysLeft = expiry
      ? Math.ceil(
        (expiry.getTime() - today.getTime()) /
        (1000 * 60 * 60 * 24)
      )
      : null;

    if (statusFilter === "Expired") {
      matchesStatus =
        daysLeft !== null && daysLeft < 0;
    }

    if (statusFilter === "Expiring Soon") {
      matchesStatus =
        daysLeft !== null &&
        daysLeft >= 0 &&
        daysLeft <= 7;
    }

    if (statusFilter === "Safe") {
      matchesStatus =
        daysLeft !== null && daysLeft > 7;
    }

    if (statusFilter === "Low Stock") {
      matchesStatus =
        quantity > 2 && quantity <= 5;
    }

    if (statusFilter === "Critical") {
      matchesStatus = quantity <= 2;
    }

   return (
  matchesSearch &&
  matchesCategory &&
  matchesStatus
);
});

  filteredProducts = filteredProducts.sort((a, b) => {
  const dateA = a.expiry_date
    ? new Date(a.expiry_date).getTime()
    : 0;

  const dateB = b.expiry_date
    ? new Date(b.expiry_date).getTime()
    : 0;

  return sortOrder === "nearest"
    ? dateA - dateB
    : dateB - dateA;
});



  const summaryCard = {
  background: "white",
  padding: "20px",
  borderRadius: "16px",
  textAlign: "center" as const,
  boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
    };

  return (
  <div
    style={{
      minHeight: "100vh", 
      padding: "30px",
      background: "#f8f5ff"
    }}
  >
   
      <div style={{ marginBottom: "20px" }}>
        <h1
          style={{
            color: "#6d28d9",
            marginBottom: "5px",
          }}
        >
          🍽️ ShelfWise
        </h1>

        <p style={{ color: "#666" }}>
          Restaurant Inventory Manager
        </p>
      </div>



      {/* NAVIGATION */}

      <div
        style={{
          display: "flex",
          gap: "10px",
          marginBottom: "20px",
          flexWrap: "wrap",
        }}
      >
        <a
          href="/"
          style={{
            background: "#6d28d9",
            color: "white",
            padding: "10px 16px",
            borderRadius: "10px",
            textDecoration: "none",
          }}
        >
          Dashboard
        </a>

        <a
          href="/add"
          style={{
            background: "#7c3aed",
            color: "white",
            padding: "10px 16px",
            borderRadius: "10px",
            textDecoration: "none",
          }}
        >
          Add Product
        </a>
        <button
          onClick={exportToCSV}
          style={{
            background: "#10b981",
            color: "white",
            padding: "10px 16px",
            borderRadius: "10px",
            border: "none",
            cursor: "pointer",
          }}
        >
          ⬇️ Export CSV
        </button>
      </div>

      {/* FILTERS */}

      <div
        style={{
          display: "flex",
          gap: "10px",
          flexWrap: "wrap",
          marginBottom: "25px",
        }}
      >
        <input
          type="text"
          placeholder="🔍 Search products..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1,
            minWidth: "220px",
            padding: "12px",
            borderRadius: "12px",
            border: "1px solid #ddd",
          }}
        />

        <select
  value={category}
  onChange={(e) => setCategory(e.target.value)}
  style={{
    padding: "12px",
    borderRadius: "12px",
    border: "1px solid #ddd",
  }}
>
  <option>All</option>
  <option>Dairy</option>
  <option>Meat</option>
  <option>Dry Products</option>
  <option>Frozen</option>
  <option>Sauces</option>
</select>

<select
  value={statusFilter}
  onChange={(e) =>
    setStatusFilter(e.target.value)
  }
  style={{
    padding: "12px",
    borderRadius: "12px",
    border: "1px solid #ddd",
  }}
>
  <option>All</option>
  <option>Safe</option>
  <option>Expiring Soon</option>
  <option>Expired</option>
  <option>Low Stock</option>
  <option>Critical</option>
</select>

          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value)
            }
            style={{
              padding: "12px",
              borderRadius: "12px",
              border: "1px solid #ddd",
            }}
          >
            <option>All</option>
            <option>Safe</option>
            <option>Expiring Soon</option>
            <option>Expired</option>
            <option>Low Stock</option>
            <option>Critical</option>
          </select>

          <select
            value={sortOrder}
            onChange={(e) =>
              setSortOrder(e.target.value)
            }
            style={{
              padding: "12px",
              borderRadius: "12px",
              border: "1px solid #ddd",
            }}
          >
            <option value="nearest">
              Nearest Expiry
            </option>
            <option value="farthest">
              Farthest Expiry
            </option>
          </select>
      </div>

      {/* PRODUCT CARDS */}

      <h2
        style={{
          marginBottom: "20px",
          color: "#6d28d9",
        }}
      >
        {category !== "All"
          ? `📂 ${category} Products`
          : statusFilter !== "All"
            ? `📋 ${statusFilter} Products`
            : "📦 All Products"}
      </h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fill,minmax(280px,1fr))",
          gap: "20px",
        }}
      >
        {filteredProducts.map((p) => {
          const expiryStatus = getExpiryStatus(
            p.expiry_date
          );

          const stockStatus = getStockStatus(
            Number(p.quantity)
          );

          return (
            <div
              key={p.id}
              style={{
                background: "white",
                borderRadius: "18px",
                padding: "16px",
                boxShadow:
                  "0 4px 12px rgba(0,0,0,0.08)",
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
                    marginBottom: "12px",
                  }}
                />
              ) : (
                <div
                  style={{
                    height: "180px",
                    background: "#eee",
                    borderRadius: "12px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  No Image
                </div>
              )}

              <h2>{p.name}</h2>


              <p>
                <strong>Quantity:</strong> {p.quantity} {p.unit}
              </p>

              <p>
                <strong>Location:</strong> {p.location}
              </p>

              <p>
                <strong>Storage:</strong> {p.storage_type}
              </p>

              <p>
                <strong>Expiry:</strong> {p.expiry_date || "-"}
              </p>

              <p>
                <strong>Prepared By:</strong> {p.prepared_by || "-"}
              </p>

              <p>
                <strong>Date Added:</strong>{" "}
                {p.Date_added
                  ? new Date(p.Date_added).toLocaleDateString()
                  : "-"}
              </p>

              <div
                style={{
                  marginTop: "10px",
                  display: "flex",
                  gap: "8px",
                  flexWrap: "wrap",
                }}
              >
                <div
                  style={{
                    background: expiryStatus.color,
                    color: "white",
                    padding: "6px 12px",
                    borderRadius: "999px",
                    fontSize: "14px",
                    fontWeight: "bold",
                  }}
                >
                  {expiryStatus.text}
                </div>

                <div
                  style={{
                    background: stockStatus.color,
                    color: "white",
                    padding: "6px 12px",
                    borderRadius: "999px",
                    fontSize: "14px",
                    fontWeight: "bold",
                  }}
                >
                  {stockStatus.text}
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  marginTop: "15px",
                }}
              >
                <a
                  href={`/edit?id=${p.id}`}
                  style={{
                    background: "#3b82f6",
                    color: "white",
                    padding: "10px 16px",
                    borderRadius: "10px",
                    textDecoration: "none",
                  }}
                >
                  Edit
                </a>

                <button
                  onClick={() =>
                    deleteProduct(p.id, p.name)
                  }
                  style={{
                    background: "#ef4444",
                    color: "white",
                    padding: "10px 16px",
                    borderRadius: "10px",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
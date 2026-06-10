"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function EditProduct() {
  const [id, setId] = useState("");
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    name: "",
    category: "",
    quantity: "",
    unit: "",
    expiry_date: "",
    location: "",
    storage_type: "",
    shelf: "",
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const productId = params.get("id");

    if (productId) {
      setId(productId);
      loadProduct(productId);
    }
  }, []);

  async function loadProduct(productId: string) {
    const { data } = await supabase
      .from("products")
      .select("*")
      .eq("id", productId)
      .single();

    if (data) {
      setForm({
        name: data.name || "",
        category: data.category || "",
        quantity: String(data.quantity || ""),
        unit: data.unit || "",
        expiry_date: data.expiry_date || "",
        location: data.location || "",
        storage_type: data.storage_type || "",
        shelf: data.shelf || "",
      });
    }

    setLoading(false);
  }

  async function saveProduct() {
    const { error } = await supabase
      .from("products")
      .update({
        ...form,
        quantity: Number(form.quantity),
      })
      .eq("id", id);

    if (error) {
      alert(error.message);
      return;
    }

    alert("Product updated!");
    window.location.href = "/inventory";
  }

  if (loading) {
    return <div style={{ padding: 30 }}>Loading...</div>;
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f8f5ff",
        padding: "30px",
      }}
    >
      <h1
        style={{
          color: "#6d28d9",
          marginBottom: "20px",
        }}
      >
        ✏️ Edit Product
      </h1>

      <div
        style={{
          background: "white",
          padding: "20px",
          borderRadius: "16px",
          maxWidth: "500px",
        }}
      >
        <input
          value={form.name}
          placeholder="Name"
          onChange={(e) =>
            setForm({ ...form, name: e.target.value })
          }
          style={{ width: "100%", marginBottom: "10px" }}
        />

        <input
          value={form.category}
          placeholder="Category"
          onChange={(e) =>
            setForm({ ...form, category: e.target.value })
          }
          style={{ width: "100%", marginBottom: "10px" }}
        />

        <input
          value={form.quantity}
          placeholder="Quantity"
          onChange={(e) =>
            setForm({ ...form, quantity: e.target.value })
          }
          style={{ width: "100%", marginBottom: "10px" }}
        />

        <input
          value={form.unit}
          placeholder="Unit"
          onChange={(e) =>
            setForm({ ...form, unit: e.target.value })
          }
          style={{ width: "100%", marginBottom: "10px" }}
        />

        <input
          type="date"
          value={form.expiry_date}
          onChange={(e) =>
            setForm({
              ...form,
              expiry_date: e.target.value,
            })
          }
          style={{ width: "100%", marginBottom: "10px" }}
        />

        <input
          value={form.location}
          placeholder="Location"
          onChange={(e) =>
            setForm({ ...form, location: e.target.value })
          }
          style={{ width: "100%", marginBottom: "10px" }}
        />

        <select
          value={form.storage_type}
          onChange={(e) =>
            setForm({
              ...form,
              storage_type: e.target.value,
            })
          }
          style={{ width: "100%", marginBottom: "10px" }}
        >
          <option value="">Storage Type</option>
          <option value="Fridge">Fridge</option>
          <option value="Freezer">Freezer</option>
          <option value="Pantry">Pantry</option>
          <option value="Dry Storage">Dry Storage</option>
        </select>

        <select
          value={form.shelf}
          onChange={(e) =>
            setForm({
              ...form,
              shelf: e.target.value,
            })
          }
          style={{ width: "100%", marginBottom: "10px" }}
        >
          <option value="">Shelf</option>
          <option value="Shelf 1">Shelf 1</option>
          <option value="Shelf 2">Shelf 2</option>
          <option value="Shelf 3">Shelf 3</option>
          <option value="Door">Door</option>
          <option value="Drawer">Drawer</option>
        </select>

        <button
          onClick={saveProduct}
          style={{
            background: "#6d28d9",
            color: "white",
            padding: "12px 20px",
            border: "none",
            borderRadius: "10px",
          }}
        >
          Save Changes
        </button>
      </div>
    </div>
  );
}
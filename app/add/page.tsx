"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabase";

export default function AddProduct() {
  const [file, setFile] = useState<File | null>(null);

  const [form, setForm] = useState({
    name: "",
    quantity: "",
    unit: "",
    expiry_date: "",
    location: "",
    storage_type: "",
    prepared_by: "",
  });

  async function uploadImage() {
    if (!file) return null;

    const filePath = `products/${Date.now()}-${file.name}`;

    const { data, error } = await supabase.storage
      .from("product-images")
      .upload(filePath, file);

    console.log("UPLOAD DATA:", data);
    console.log("UPLOAD ERROR:", error);

    if (error) {
      alert(error.message);
      return null;
    }

    return data.path;
  }

  async function submit() {
    try {
      const imagePath = await uploadImage();

      console.log("IMAGE PATH:", imagePath);

      const { data, error } = await supabase
        .from("products")
        .insert({
          ...form,
          quantity: Number(form.quantity),
          image_url: imagePath,
          Date_added: new Date().toISOString(),
        });

      console.log("INSERT DATA:", data);
      console.log("INSERT ERROR:", error);

      if (error) {
        alert(error.message);
        return;
      }

      alert("Product added!");

      setForm({
          name: "",
          quantity: "",
          unit: "",
          expiry_date: "",
          location: "",
          storage_type: "",
          prepared_by: "",
        });

      setFile(null);
    } catch (err) {
      console.error(err);
      alert("Something went wrong");
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Add Product</h1>

    <input
  placeholder="Name"
  onChange={(e) =>
    setForm({ ...form, name: e.target.value })
    }
    />

      <br />
      <br />

            <input
        placeholder="Quantity"
        onChange={(e) => setForm({ ...form, quantity: e.target.value })}
      />
      <br />
      <br />

      <input
        placeholder="Unit"
        onChange={(e) => setForm({ ...form, unit: e.target.value })}
      />
      <br />
      <br />

      
      <input
        placeholder="Location"
        onChange={(e) => setForm({ ...form, location: e.target.value })}
      />
      <br />
      <br />

      <select
  onChange={(e) => {
    const storage = e.target.value;

    let expiryDate = "";

    if (storage === "Freezer") {
      const date = new Date();
      date.setMonth(date.getMonth() + 2);
      expiryDate = date.toISOString().split("T")[0];
    }

    if (storage === "Dry Storage") {
      const date = new Date();
      date.setMonth(date.getMonth() + 3);
      expiryDate = date.toISOString().split("T")[0];
    }

    setForm({
      ...form,
      storage_type: storage,
      expiry_date: expiryDate || form.expiry_date,
    });
  }}  
>
  <option value="">Storage Type</option>
  <option value="Fridge">Fridge</option>
  <option value="Freezer">Freezer</option>
  <option value="Pantry">Pantry</option>
  <option value="Dry Storage">Dry Storage</option>
</select>

      <br />
      <br />
      <label>Use By Date</label>

<br />

<input
  type="date"
  value={form.expiry_date}
  onChange={(e) =>
    setForm({ ...form, expiry_date: e.target.value })
  }
/>

      <br />
      <br />
  
<input
  type="file"
  accept="image/*"
  onChange={(e) => setFile(e.target.files?.[0] || null)}
/>

<br />
<br />

<input
  placeholder="Prepared By (Optional)"
  onChange={(e) =>
    setForm({ ...form, prepared_by: e.target.value })
  }
/>

<br />
<br />

    <button onClick={submit}>Save</button>
</div>
);
}
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Download,
  Upload,
  Search,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Edit2,
  FileText,
  Save,
  X,
  Loader2,
  ShoppingBag,
  ExternalLink
} from "lucide-react";

export default function AdminCatalogPage() {
  const [products, setProducts] = useState([]);
  const [totalProducts, setTotalProducts] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [pageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [storeId] = useState("3"); // Default store

  // Editing state
  const [activeProduct, setActiveProduct] = useState(null);
  const [editImage, setEditImage] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [savingProduct, setSavingProduct] = useState(false);

  // Import state
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  // UI status notification
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchCatalog = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        store_id: storeId,
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search.trim()) {
        params.set("search", search.trim());
      }
      
      const res = await fetch(`/api/shop/api/public/products?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch product catalog");
      
      const json = await res.json();
      if (json.success) {
        setProducts(json.data.records || []);
        setTotalPages(json.data.totalPages || 1);
        setTotalProducts(json.data.total || 0);
      } else {
        throw new Error(json.message || "Failed to load products");
      }
    } catch (err) {
      console.error(err);
      showToast(err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCatalog();
  }, [page, search]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchCatalog();
  };

  // Export CSV
  const handleExport = () => {
    window.open(`/api/admin/products/export?store_id=${storeId}`, "_blank");
    showToast("Product catalog CSV download started", "success");
  };

  // Trigger file selection for CSV upload
  const triggerImport = () => {
    fileInputRef.current?.click();
  };

  // Handle CSV Upload
  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    showToast("Reading CSV file...", "info");

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const csvText = String(reader.result || "");
        const res = await fetch("/api/admin/products/import", {
          method: "POST",
          headers: { "Content-Type": "text/csv" },
          body: csvText,
        });

        const json = await res.json();
        if (json.success) {
          showToast(json.message || "CSV catalog imported successfully", "success");
          fetchCatalog(); // refresh listing
        } else {
          throw new Error(json.message || "Import failed");
        }
      } catch (err) {
        console.error(err);
        showToast(err.message, "error");
      } finally {
        setImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };

    reader.readAsText(file);
  };

  // Select product for editing
  const handleStartEdit = (product) => {
    setActiveProduct(product);
    setEditImage(product.image_url || "");
    setEditDesc(product.description || "");
  };

  // Close edit modal
  const handleCancelEdit = () => {
    setActiveProduct(null);
  };

  // Save product details
  const handleSaveProduct = async () => {
    if (!activeProduct) return;
    setSavingProduct(true);
    try {
      const barcode = activeProduct.barcode;
      const res = await fetch(`/api/admin/products/${barcode}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_url: editImage,
          description: editDesc,
        }),
      });

      const json = await res.json();
      if (json.success) {
        showToast("Product details updated successfully", "success");
        setActiveProduct(null);
        // Update product in list state to save extra API call
        setProducts(prev =>
          prev.map(p =>
            p.barcode === barcode
              ? { ...p, image_url: editImage, description: editDesc }
              : p
          )
        );
      } else {
        throw new Error(json.message || "Failed to update product");
      }
    } catch (err) {
      console.error(err);
      showToast(err.message, "error");
    } finally {
      setSavingProduct(false);
    }
  };

  // Handle uploading individual product image (base64)
  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      setEditImage(String(reader.result || ""));
      showToast("Image read successfully. Click Save to store in database.", "success");
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-16">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 rounded-lg px-4 py-3 text-sm font-semibold text-white shadow-lg transition-all duration-300 ${
            toast.type === "success"
              ? "bg-green-600"
              : toast.type === "error"
              ? "bg-red-600"
              : "bg-blue-600"
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Admin Navbar */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200 py-4 px-8 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
              <ShoppingBag className="text-blue-600 h-6 w-6" />
              E-Commerce Admin Dashboard
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Enrich central store catalog with images & descriptions in a separate database
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-blue-600 bg-gray-100 hover:bg-blue-50 px-3 py-2 rounded-lg border border-gray-200 transition"
            >
              Go to Store
              <ExternalLink size={12} />
            </Link>
            <button
              onClick={handleExport}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3.5 py-2 rounded-lg transition"
            >
              <Download size={14} />
              Export to Excel/CSV
            </button>
            <button
              onClick={triggerImport}
              disabled={importing}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-100 border border-gray-300 px-3.5 py-2 rounded-lg transition disabled:opacity-50"
            >
              <Upload size={14} />
              {importing ? "Importing..." : "Import CSV/Excel"}
            </button>
            <input
              type="file"
              ref={fileInputRef}
              accept=".csv"
              onChange={handleImport}
              className="hidden"
            />
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-6 mt-8">
        
        {/* Statistics & Instructions */}
        <div className="grid gap-4 md:grid-cols-3 mb-6">
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
            <div className="bg-blue-50 p-3 rounded-lg text-blue-600">
              <FileText size={24} />
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase">Total Catalog Items</p>
              <h2 className="text-2xl font-bold text-gray-900 mt-0.5">{totalProducts}</h2>
            </div>
          </div>
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm md:col-span-2">
            <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wide">💡 Bulk Editing Instruction</h3>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              1. Click <b>Export to Excel/CSV</b> to download all products of this store.<br/>
              2. Open the file in Excel. Insert image URLs (or base64 strings) in the <b>Ecom Image URL / Base64</b> column, and write text in <b>Ecom Description</b>.<br/>
              3. Save and click <b>Import CSV/Excel</b>. Your e-commerce DB will be updated instantly!
            </p>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <form onSubmit={handleSearchSubmit} className="relative max-w-md w-full">
            <input
              type="text"
              placeholder="Search by name, barcode or SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-gray-50 border border-gray-300 rounded-lg pl-10 pr-4 py-2 text-sm outline-none focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
            />
            <Search className="absolute left-3.5 top-2.5 text-gray-400 h-4 w-4" />
          </form>
          
          {/* Pagination Top Controls */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage(p => Math.max(p - 1, 1))}
                disabled={page === 1 || loading}
                className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setPage(p => Math.min(p + 1, totalPages))}
                disabled={page === totalPages || loading}
                className="p-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Products Grid */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <Loader2 className="animate-spin text-blue-600 h-10 w-10" />
            <p className="text-sm font-medium text-gray-500">Loading catalog from central server...</p>
          </div>
        ) : products.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center shadow-sm">
            <ImageIcon className="mx-auto text-gray-300 h-12 w-12 mb-2" />
            <h3 className="font-semibold text-gray-700 text-sm">No products found</h3>
            <p className="text-xs text-gray-400 mt-1">Try resetting your search query.</p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {products.map((p) => {
              const hasEcomImage = !!p.image_url;
              const hasEcomDesc = !!p.description;
              
              return (
                <div
                  key={p.id}
                  className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm flex flex-col justify-between hover:shadow-md transition group"
                >
                  <div className="p-4 flex-1">
                    {/* Image Preview Container */}
                    <div className="relative aspect-video bg-gray-50 border border-gray-100 rounded-lg flex items-center justify-center overflow-hidden mb-4">
                      {hasEcomImage ? (
                        <img
                          src={p.image_url}
                          alt={p.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex flex-col items-center gap-1.5 text-gray-300">
                          <ImageIcon size={28} />
                          <span className="text-[10px] font-semibold uppercase tracking-wide">No Custom Image</span>
                        </div>
                      )}
                      
                      {/* Enriched badges */}
                      <div className="absolute top-2 right-2 flex gap-1">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-sm text-white ${hasEcomImage ? 'bg-green-600' : 'bg-amber-600'}`}>
                          {hasEcomImage ? "Image Active" : "No Image"}
                        </span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-sm text-white ${hasEcomDesc ? 'bg-green-600' : 'bg-amber-600'}`}>
                          {hasEcomDesc ? "Desc Active" : "No Desc"}
                        </span>
                      </div>
                    </div>

                    {/* Meta info */}
                    <span className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide">
                      {p.brand_name || p.category_name || "General"}
                    </span>
                    <h3 className="font-semibold text-gray-900 text-sm mt-0.5 line-clamp-2 min-h-[40px] leading-tight">
                      {p.name}
                    </h3>
                    <p className="text-[10px] text-gray-400 mt-1">
                      Barcode: <span className="font-mono text-gray-600 font-medium">{p.barcode || "N/A"}</span>
                    </p>

                    {/* Price Tag */}
                    <div className="flex items-baseline gap-1.5 mt-3">
                      <span className="text-sm font-bold text-gray-900">₹{p.selling_price}</span>
                      {p.mrp > p.selling_price && (
                        <del className="text-xs text-gray-400 font-medium">₹{p.mrp}</del>
                      )}
                    </div>

                    {/* Description Snippet */}
                    <div className="mt-4 pt-3 border-t border-gray-100">
                      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">E-Commerce Description:</p>
                      <p className="text-xs text-gray-400 mt-1 line-clamp-2 leading-relaxed">
                        {p.description || <i>No custom description configured yet.</i>}
                      </p>
                    </div>
                  </div>

                  <div className="p-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                    <span className="text-[10px] font-medium text-gray-500">Unit: {p.unit}</span>
                    <button
                      onClick={() => handleStartEdit(p)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-white bg-blue-50 hover:bg-blue-600 border border-blue-200 px-3 py-1.5 rounded-lg transition"
                    >
                      <Edit2 size={12} />
                      Edit Details
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Bottom Pagination */}
        {!loading && products.length > 0 && (
          <div className="mt-8 flex items-center justify-between bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
            <span className="text-xs text-gray-500 font-medium">
              Showing {products.length} of {totalProducts} catalog products
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(p - 1, 1))}
                disabled={page === 1}
                className="inline-flex items-center gap-1 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-100 border border-gray-300 px-3 py-2 rounded-lg transition disabled:opacity-40"
              >
                <ChevronLeft size={14} />
                Previous
              </button>
              <button
                onClick={() => setPage(p => Math.min(p + 1, totalPages))}
                disabled={page === totalPages}
                className="inline-flex items-center gap-1 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-100 border border-gray-300 px-3 py-2 rounded-lg transition disabled:opacity-40"
              >
                Next
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Edit Drawer/Modal */}
      {activeProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/40 backdrop-blur-xs">
          <div className="w-full max-w-xl h-full bg-white shadow-2xl flex flex-col justify-between transition-transform duration-300 transform translate-x-0">
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-200 flex items-center justify-between bg-gray-50">
              <div>
                <span className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide">
                  Editing Product Local Metadata
                </span>
                <h2 className="text-base font-bold text-gray-900 mt-0.5 line-clamp-1">
                  {activeProduct.name}
                </h2>
              </div>
              <button
                onClick={handleCancelEdit}
                className="p-1 rounded-lg hover:bg-gray-200 transition text-gray-500"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 flex-1 overflow-y-auto space-y-6">
              {/* Product Info Readonly */}
              <div className="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-xl border border-gray-200 text-xs">
                <div>
                  <span className="block text-gray-400 font-semibold uppercase">Barcode</span>
                  <span className="font-mono font-medium text-gray-800 mt-0.5 block">{activeProduct.barcode || "N/A"}</span>
                </div>
                <div>
                  <span className="block text-gray-400 font-semibold uppercase">SKU</span>
                  <span className="font-mono font-medium text-gray-800 mt-0.5 block">{activeProduct.sku || "N/A"}</span>
                </div>
                <div>
                  <span className="block text-gray-400 font-semibold uppercase">Category</span>
                  <span className="font-medium text-gray-800 mt-0.5 block">{activeProduct.category_name || "General"}</span>
                </div>
                <div>
                  <span className="block text-gray-400 font-semibold uppercase">Selling Price</span>
                  <span className="font-medium text-gray-800 mt-0.5 block">₹{activeProduct.selling_price}</span>
                </div>
              </div>

              {/* Product Image Form */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide">
                  Product Image URL or Base64
                </label>
                <textarea
                  rows={3}
                  value={editImage}
                  onChange={(e) => setEditImage(e.target.value)}
                  placeholder="Paste direct image link or choose a local file..."
                  className="w-full text-xs font-mono bg-gray-50 border border-gray-300 rounded-lg p-2.5 outline-none focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition resize-y"
                />
                
                {/* Local Upload */}
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-gray-500 font-medium">Or choose local file:</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="text-xs text-gray-600 file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-[10px] file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                  />
                </div>

                {/* Preview */}
                {editImage && (
                  <div className="mt-2.5 p-2 bg-gray-50 border border-gray-200 rounded-lg max-w-sm">
                    <p className="text-[10px] text-gray-400 uppercase font-semibold mb-1">Preview:</p>
                    <img
                      src={editImage}
                      alt="Local Preview"
                      className="aspect-video w-full rounded-md object-cover border border-gray-100"
                    />
                  </div>
                )}
              </div>

              {/* Product Description Form */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide">
                  E-Commerce Product Description
                </label>
                <textarea
                  rows={8}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  placeholder="Write details description for the e-commerce customers (e.g. usage instructions, ingredients, benefits...)"
                  className="w-full text-sm bg-gray-50 border border-gray-300 rounded-lg p-3 outline-none focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition resize-y leading-relaxed"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-gray-200 flex items-center justify-end gap-3 bg-gray-50">
              <button
                onClick={handleCancelEdit}
                className="text-xs font-semibold text-gray-700 bg-white hover:bg-gray-100 border border-gray-300 px-4 py-2 rounded-lg transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveProduct}
                disabled={savingProduct}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg transition disabled:opacity-50"
              >
                {savingProduct ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save size={12} />
                    Save Changes
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";
import Link from "next/link";
import { Heart, Plus, ShoppingBag, Trash2 } from "lucide-react";
import AppHeader,{PageFooter} from "@/components/AppHeader";
import {useStore} from "@/context/StoreContext";
const money=v=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2}).format(Number(v||0));
export default function Wishlist(){const{wishlist,toggleWishlist,updateCart}=useStore();return <><AppHeader/><main className="route-page"><div className="route-title"><span>SAVED FOR LATER</span><h1>My wishlist</h1><p>{wishlist.length} saved {wishlist.length===1?"item":"items"}</p></div>{wishlist.length===0?<div className="route-empty"><Heart/><h2>Nothing saved yet</h2><p>Tap the heart on products you want to revisit.</p><Link href="/">Explore products</Link></div>:<div className="saved-grid">{wishlist.map(product=><article key={product.id}><Link href={`/product/${product.id}`} className="saved-media">{product.image_url?<img src={product.image_url} alt={product.name}/>:<ShoppingBag/>}</Link><small>{product.brand_name||product.category_name}</small><h3>{product.name}</h3><b>{money(product.selling_price)}</b><div><button onClick={()=>updateCart(product,1)}>Add <Plus/></button><button aria-label="Remove" onClick={()=>toggleWishlist(product)}><Trash2/></button></div></article>)}</div>}</main><PageFooter/></>}

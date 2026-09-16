const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { items, nombre_cliente, telefono } = JSON.parse(event.body);
    // items esperado: [{ id: "<id-del-producto-en-supabase>", cantidad: 2 }, ...]
    // El precio que pinta el carrito en el navegador es SOLO referencial.
    // Acá se ignora por completo y se recalcula contra la base de datos,
    // para que nadie pueda manipular el precio final desde el navegador.

    if (!items || items.length === 0) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Carrito vacío' }) };
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY // clave secreta: solo existe aquí, nunca en el navegador
    );

    const ids = [...new Set(items.map(i => i.id).filter(Boolean))];
    let productos = [];
    if (ids.length > 0) {
      const { data, error: errProductos } = await supabase
        .from('productos')
        .select('*')
        .in('id', ids);
      if (errProductos) throw errProductos;
      productos = data;
    }

    // Arma los ítems verificados. Si un producto ya no existe, está agotado,
    // o no tiene precio cargado, se descarta en vez de tumbar todo el pedido.
    const descartados = [];
    const mpItems = [];

    for (const i of items) {
      const p = productos.find(pr => String(pr.id) === String(i.id));
      const cantidad = Number.isInteger(i.cantidad) && i.cantidad > 0 ? i.cantidad : 1;

      if (!p || p.en_stock === false || p.precio == null) {
        descartados.push(i.id);
        continue;
      }

      mpItems.push({
        id: p.id,
        title: p.nombre,
        quantity: cantidad,
        unit_price: p.precio,
        currency_id: 'CLP'
      });
    }

    if (mpItems.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Ninguno de los productos del carrito existe o está disponible. Vacía el carrito e intenta de nuevo.' })
      };
    }

    const total = mpItems.reduce((sum, i) => sum + i.unit_price * i.quantity, 0);

    // 1. Crear el pedido en Supabase ANTES de pagar, estado "pendiente_pago"
    const { data: pedido, error: errPedido } = await supabase
      .from('pedidos')
      .insert({
        nombre_cliente: nombre_cliente || 'Cliente web',
        telefono: telefono || null,
        items: mpItems.map(i => ({
          producto_id: i.id,
          nombre: i.title,
          cantidad: i.quantity,
          precio_unitario: i.unit_price
        })),
        total,
        estado: 'pendiente_pago'
      })
      .select()
      .single();

    if (errPedido) throw errPedido;

    // 2. Pedirle a Mercado Pago el link de pago (preferencia)
    const siteUrl = process.env.URL || 'https://TU-SITIO.netlify.app';

    const mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.MP_ACCESS_TOKEN}`
      },
      body: JSON.stringify({
        items: mpItems,
        external_reference: pedido.id,
        back_urls: {
          success: `${siteUrl}/?pago=exitoso`,
          failure: `${siteUrl}/?pago=fallido`,
          pending: `${siteUrl}/?pago=pendiente`
        },
        auto_return: 'approved',
        notification_url: `${siteUrl}/.netlify/functions/webhook-mp`
      })
    });

    const preference = await mpResponse.json();

    if (!mpResponse.ok) {
      console.error('Error de Mercado Pago:', preference);
      return { statusCode: 500, body: JSON.stringify({ error: 'No se pudo crear el pago' }) };
    }

    if (descartados.length > 0) {
      console.warn('Ítems del carrito descartados (ya no existen o no disponibles):', descartados);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ init_point: preference.init_point, pedido_id: pedido.id, descartados })
    };

  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

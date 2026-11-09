// ============================================================================
// MESA VIVA — C# / .NET 8 WEB API ENTRYPOINT & CONTROLLERS
// ASP.NET Core Web API + EF Core PostgreSQL + SignalR Hub + RBAC Policies
// ============================================================================

using System;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.EntityFrameworkCore;
using MesaViva.Infrastructure;

namespace MesaViva.Api
{
    public class Program
    {
        public static void Main(string[] args)
        {
            var builder = WebApplication.CreateBuilder(args);

            // 1. PostgreSQL EF Core Configuration with Retry on Transient Failures
            builder.Services.AddDbContext<MesaVivaDbContext>(options =>
                options.UseNpgsql(
                    builder.Configuration.GetConnectionString("DefaultConnection"),
                    npgsql => npgsql.EnableRetryOnFailure(3)
                ));

            // 2. Real-Time SignalR Hub Configuration
            builder.Services.AddSignalR();

            // 3. Role-Based Authorization Policies (Isolating Client, Waiter, Kitchen, Cashier, Admin, SuperAdmin)
            builder.Services.AddAuthorization(options =>
            {
                options.AddPolicy("ClientSessionOnly", policy => policy.RequireClaim("SessionScope", "TABLE_CLIENT"));
                options.AddPolicy("WaiterOrAdmin", policy => policy.RequireRole("WAITER", "ADMIN", "SUPER_ADMIN"));
                options.AddPolicy("KitchenOrAdmin", policy => policy.RequireRole("KITCHEN", "ADMIN", "SUPER_ADMIN"));
                options.AddPolicy("CashierOrAdmin", policy => policy.RequireRole("CASHIER", "ADMIN", "SUPER_ADMIN"));
                options.AddPolicy("EstablishmentAdminOnly", policy => policy.RequireRole("ADMIN", "SUPER_ADMIN"));
                options.AddPolicy("PlatformSuperAdminOnly", policy => policy.RequireRole("SUPER_ADMIN"));
            });

            builder.Services.AddControllers();

            var app = builder.Build();

            if (!app.Environment.IsDevelopment())
            {
                app.UseHsts();
                app.UseHttpsRedirection();
            }

            app.UseAuthentication();
            app.UseAuthorization();

            app.MapControllers();
            app.MapHub<MesaVivaRealtimeHub>("/hubs/mesaviva");

            app.Run();
        }
    }
}
